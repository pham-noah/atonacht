//! Installing a newer Atonacht from inside Atonacht.
//!
//! What a phone user expects from "Download and install" is what every app store does: a bar that moves, then the
//! normal "do you want to update" prompt. Handing the asset URL to a browser (what the update screen did before)
//! leaves a file in Downloads, asks the *browser* for install permission, and installs nothing.
//!
//! So the download happens here rather than in the web layer, for two reasons that are not stylistic:
//!
//! - the APK lives on `github.com`/`objects.githubusercontent.com`, which is outside the `http` plugin's scope (it
//!   allows `https://api.github.com/*` and nothing else) — widening the scope would also let any script in the webview
//!   fetch arbitrary URLs;
//! - the file has to land in the app's own cache dir, the one directory the manifest's FileProvider exposes
//!   (`${applicationId}.fileprovider`, see `res/xml/file_paths.xml`), which only the native side can name.
//!
//! Nothing installs itself. `install` hands the file to Android's package installer; the user taps through the prompt,
//! and Android only accepts an APK signed with the key the installed app already has.

use std::io::Write;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

/// The file name a download may use. The name comes from the release JSON — remote text — so it is reduced to
/// letters, digits, dots, dashes and underscores, stripped of leading dots, and made to end in `.apk`; `../../x`
/// must not choose a directory.
pub fn safe_name(name: &str) -> String {
    let stem = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut cleaned: String = stem
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    while cleaned.starts_with('.') {
        cleaned.remove(0);
    }
    if cleaned.len() > 60 {
        cleaned.truncate(56);
    }
    if cleaned.is_empty() {
        cleaned.push_str("Atonacht");
    }
    if !cleaned.to_ascii_lowercase().ends_with(".apk") {
        cleaned.push_str(".apk");
    }
    cleaned
}

/// A download is only an APK once every byte of it is here: a length the server stated must match what arrived.
fn arrived_whole(written: u64, total: u64) -> bool {
    total == 0 || written == total
}

/// Downloads the release's APK into the app's cache and returns the path. Progress goes out as `update-progress`
/// events; a short file is deleted and reported instead of being handed to the installer.
#[tauri::command]
pub async fn update_download(app: AppHandle, url: String, name: String, size: u64) -> Result<String, String> {
    // The URL is remote text too: only GitHub's own release downloads are followed.
    let host = url.split("://").nth(1).unwrap_or("").split('/').next().unwrap_or("");
    if !url.starts_with("https://") || !(host == "github.com" || host.ends_with(".githubusercontent.com")) {
        return Err("That update does not come from GitHub.".into());
    }

    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("This app has no cache folder to download into: {e}"))?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let target = dir.join(safe_name(&name));
    // A file left by an earlier, interrupted download is not an update to install.
    let _ = std::fs::remove_file(&target);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("GitHub answered {} for the APK.", res.status().as_u16()));
    }
    let total = res.content_length().unwrap_or(size);

    let written = async {
        let mut file = std::fs::File::create(&target).map_err(|e| format!("Could not write {}: {e}", target.display()))?;
        let mut done = 0u64;
        let mut last_pct = u64::MAX;
        while let Some(chunk) = res.chunk().await.map_err(|e| format!("The download stopped: {e}"))? {
            file.write_all(&chunk)
                .map_err(|e| format!("Could not write {}: {e}", target.display()))?;
            done += chunk.len() as u64;
            // One event per percent: the bar moves and the pipe is not flooded.
            let pct = if total > 0 { done * 100 / total } else { 0 };
            if pct != last_pct {
                last_pct = pct;
                let _ = app.emit("update-progress", Progress { done, total });
            }
        }
        file.flush().map_err(|e| format!("Could not finish {}: {e}", target.display()))?;
        Ok::<u64, String>(done)
    }
    .await;

    let done = match written {
        Ok(n) => n,
        Err(e) => {
            let _ = std::fs::remove_file(&target);
            return Err(e);
        }
    };
    if !arrived_whole(done, total) {
        let _ = std::fs::remove_file(&target);
        return Err(format!(
            "The download stopped at {done} of {total} bytes, so it was thrown away. Try again on a better connection."
        ));
    }
    let _ = app.emit("update-progress", Progress { done, total: total.max(done) });
    Ok(target.to_string_lossy().into_owned())
}

/// Hands a downloaded APK to Android's installer. Every other platform gets a plain "not here" instead of a compile
/// error, so the same front end builds everywhere.
#[tauri::command]
pub fn update_install(path: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if crate::android_bridge::install_apk(&path)? {
            return Ok(());
        }
        Err("Android did not open its installer. Allow “install unknown apps” for Atonacht and try again.".into())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = path;
        Err("Installing from inside the app is a phone feature. On a computer, install the newer build from the release page.".into())
    }
}

/// The architecture this build was compiled for, which is the phone's: the update must fetch the matching APK, not
/// whichever one GitHub happens to list first.
#[tauri::command]
pub fn device_arch() -> String {
    std::env::consts::ARCH.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_release_asset_name_cannot_choose_a_directory() {
        assert_eq!(safe_name("Atonacht-v0.3.1-arm64.apk"), "Atonacht-v0.3.1-arm64.apk");
        assert_eq!(safe_name("../../etc/passwd"), "passwd.apk");
        assert_eq!(safe_name("..\\..\\evil"), "evil.apk");
        assert_eq!(safe_name("...hidden"), "hidden.apk");
        assert_eq!(safe_name(""), "Atonacht.apk");
        // a long name stays inside a sane length and still ends in .apk
        let long = safe_name(&"a".repeat(200));
        assert!(long.len() <= 64 && long.ends_with(".apk"), "{long}");
        // ".apk" alone is already a suffix: it must not become "apk.apk.apk"
        assert_eq!(safe_name("Atonacht.apk"), "Atonacht.apk");
    }

    #[test]
    fn a_download_is_only_kept_when_every_byte_arrived() {
        assert!(arrived_whole(21_304_247, 21_304_247));
        assert!(!arrived_whole(21_304_000, 21_304_247));
        // a server that stated no length cannot be checked, so what arrived is taken
        assert!(arrived_whole(1234, 0));
    }
}
