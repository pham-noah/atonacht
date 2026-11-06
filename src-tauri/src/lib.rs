mod android_bridge;
mod notes_fs;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct WatchState(Mutex<Option<RecommendedWatcher>>);

#[derive(Serialize)]
struct EntryDto {
    path: String,
    kind: &'static str,
    mtime: u64,
    size: u64,
}

/// The devices' own IPv4 addresses, so the app can also ask Syncthing on the LAN address it may be listening on.
#[tauri::command]
fn local_ips() -> Vec<String> {
    if_addrs::get_if_addrs()
        .map(|list| {
            list.into_iter()
                .filter(|i| !i.is_loopback())
                .filter_map(|i| match i.addr {
                    if_addrs::IfAddr::V4(v4) => Some(v4.ip.to_string()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Reads one Syncthing REST endpoint from Rust.
///
/// The app talks to Syncthing's local web interface, which is plain HTTP on a loopback or LAN address. Doing it here
/// instead of through the web layer means no plugin URL scope to get wrong, no browser CORS, and the same behaviour on
/// Android; the error string is what the UI turns into advice.
/// True for the kinds of address a Syncthing GUI lives at: loopback and the private LAN.
fn local_address(url: &str) -> bool {
    let host = url
        .split("://")
        .nth(1)
        .unwrap_or("")
        .split('/')
        .next()
        .unwrap_or("")
        .rsplit_once(':')
        .map(|(h, _)| h)
        .unwrap_or("");
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    bare == "localhost"
        || bare == "::1"
        || bare.starts_with("127.")
        || bare.starts_with("10.")
        || bare.starts_with("192.168.")
        || (bare.starts_with("172.") && bare.split('.').nth(1).and_then(|o| o.parse::<u8>().ok()).map(|o| (16..=31).contains(&o)).unwrap_or(false))
}

async fn sync_get_at(url: &str, path: &str, key: &str) -> Result<serde_json::Value, String> {
    // Syncthing's web interface certificate is self-signed by design, and Syncthing-Fork ships with HTTPS on, so a
    // verified chain would reject a correct address forever. Only local addresses get this; anything else must verify.
    let local = local_address(url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .danger_accept_invalid_certs(local)
        .danger_accept_invalid_hostnames(local)
        .build()
        .map_err(|e| e.to_string())?;
    let full = format!("{}{}", url.trim_end_matches('/'), path);
    let res = client
        .get(&full)
        .header("X-API-Key", key)
        .send()
        .await
        .map_err(|e| {
            // reqwest's own message is just "error sending request for url (...)": the reason is in the source chain,
            // and on a phone that reason is the whole answer (refused, permission, no route, TLS).
            let mut msg = e.to_string();
            let mut cause = std::error::Error::source(&e);
            while let Some(c) = cause {
                msg.push_str(&format!(" -> {}", c));
                cause = c.source();
            }
            format!("{} ({})", msg, full)
        })?;
    let status = res.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("Syncthing rejected the API key.".into());
    }
    if !status.is_success() {
        return Err(format!("Syncthing answered {} for {} ({}).", status.as_u16(), path, full));
    }
    res.json::<serde_json::Value>().await.map_err(|e| format!("Syncthing sent something unreadable: {}", e))
}

/// Opens a one-request listener on this app's own loopback and fetches it through the same path Syncthing uses.
///
/// This answers one question that nothing else can: can the HTTP client inside this app talk to 127.0.0.1 at all? If
/// this succeeds and Syncthing still does not answer, the problem is not the app's networking.
#[tauri::command]
async fn sync_selftest() -> Result<String, String> {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| format!("could not listen on loopback: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}");
        }
    });
    match sync_get_at(&format!("http://127.0.0.1:{}", port), "/selftest", "").await {
        Ok(v) if v["ok"] == serde_json::json!(true) => Ok(format!("this app reached its own loopback port {}", port)),
        Ok(_) => Err(format!("port {} answered something unexpected", port)),
        Err(e) => Err(format!("this app could not reach its own loopback port {}: {}", port, e)),
    }
}

#[tauri::command]
async fn sync_get(url: String, path: String, key: String) -> Result<serde_json::Value, String> {
    sync_get_at(&url, &path, &key).await
}

#[tauri::command]
fn default_root() -> String {
    notes_fs::default_root()
}

#[tauri::command]
fn ensure_root(root: String) -> Result<(), String> {
    notes_fs::ensure_root(&root)
}

#[tauri::command]
fn list_entries(root: String) -> Result<Vec<EntryDto>, String> {
    Ok(notes_fs::list_entries(&root)?
        .into_iter()
        .map(|e| EntryDto {
            path: e.path,
            kind: if e.is_dir { "dir" } else { "file" },
            mtime: e.mtime,
            size: e.size,
        })
        .collect())
}

#[tauri::command]
fn read_note(root: String, path: String) -> Result<String, String> {
    notes_fs::read_note(&root, &path)
}

#[tauri::command]
fn write_note(root: String, path: String, content: String) -> Result<u64, String> {
    notes_fs::write_note(&root, &path, &content)
}

#[tauri::command]
fn make_dir(root: String, path: String) -> Result<(), String> {
    notes_fs::make_dir(&root, &path)
}

#[tauri::command]
fn trash_note(root: String, path: String) -> Result<(), String> {
    notes_fs::trash_note(&root, &path)
}

#[tauri::command]
fn rename_note(root: String, from: String, to: String) -> Result<(), String> {
    notes_fs::rename_note(&root, &from, &to)
}

#[tauri::command]
fn remove_dir(root: String, path: String) -> Result<(), String> {
    notes_fs::remove_dir(&root, &path)
}

#[tauri::command]
fn list_trash(root: String) -> Result<Vec<EntryDto>, String> {
    Ok(notes_fs::list_trash(&root)?
        .into_iter()
        .map(|e| EntryDto { path: e.path, kind: "file", mtime: e.mtime, size: e.size })
        .collect())
}

#[tauri::command]
fn restore_note(root: String, path: String) -> Result<String, String> {
    notes_fs::restore_note(&root, &path)
}

#[tauri::command]
fn purge_note(root: String, path: String) -> Result<(), String> {
    notes_fs::purge_note(&root, &path)
}

/// Android only (a no-op elsewhere): pushes today's tasks to the home screen widget.
#[tauri::command]
fn set_widget_tasks(json: String) -> Result<(), String> {
    android_bridge::widget_update(&json)
}

/// Android only (a no-op elsewhere): hide the app in recents and/or block screenshots.
#[tauri::command]
fn set_privacy_flags(block_screenshots: bool, hide_in_recents: bool) -> Result<(), String> {
    android_bridge::privacy_set(block_screenshots, hide_in_recents)
}

/// Tells the UI when notes change on disk (for example when Syncthing delivers a file), so it can reload at once.
#[tauri::command]
fn watch_notes(app: AppHandle, state: State<WatchState>, root: String) -> Result<(), String> {
    let base = notes_fs::safe_join(&root, "")?;
    let seen = base.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            let relevant = matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_));
            if relevant && ev.paths.iter().any(|p| notes_fs::is_visible_path(&seen, p)) {
                let _ = app.emit("notes-changed", ());
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(&base, RecursiveMode::Recursive).map_err(|e| format!("Could not watch the notes folder: {e}"))?;
    *state.0.lock().map_err(|_| "watcher lock poisoned".to_string())? = Some(watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_notes(state: State<WatchState>) {
    if let Ok(mut w) = state.0.lock() {
        *w = None;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Brings the main window up and asks the frontend to open the capture sheet.
#[cfg(desktop)]
fn show_and_capture(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        let _ = w.emit("quick-capture", ());
    }
}

/// Tray icon: the app can be running without a window, so there is a way back to it (and a way to quit).
#[cfg(desktop)]
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::Manager;
    use tauri::tray::TrayIconBuilder;

    let capture = MenuItem::with_id(app, "capture", "Quick capture", true, Some("Ctrl+Alt+N"))?;
    let show = MenuItem::with_id(app, "show", "Show Atonacht", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&capture, &show, &quit])?;
    let mut tray = TrayIconBuilder::with_id("atonacht")
        .menu(&menu)
        .tooltip("Atonacht")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture" => show_and_capture(app),
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default()
        .manage(WatchState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_android_fs::init())
        .invoke_handler(tauri::generate_handler![
            default_root,
            ensure_root,
            list_entries,
            read_note,
            write_note,
            make_dir,
            trash_note,
            rename_note,
            remove_dir,
            list_trash,
            restore_note,
            purge_note,
            watch_notes,
            unwatch_notes,
            set_widget_tasks,
            set_privacy_flags,
            sync_get,
            local_ips,
            sync_selftest
        ]);

    // Fingerprint / face unlock exists on phones only.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    // A desktop has a keyboard, so capture from anywhere: Ctrl+Alt+N brings the window up with the capture sheet open.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                return;
            }
            if shortcut.to_string().to_lowercase().contains("alt+ctrl+n") || shortcut.to_string().to_lowercase().contains("ctrl+alt+n") {
                show_and_capture(app);
            }
        }
        ).build())
        .setup(|app| {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let gs = app.global_shortcut();
            let _ = gs.register("ctrl+alt+n");
            let _ = gs.register("ctrl+alt+space");
            build_tray(app.handle())?;
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running Atonacht");
}

#[cfg(test)]
mod sync_tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// One-request HTTP server: proves the app's own request path (reqwest + JSON) against a socket, with no Syncthing.
    fn serve_once(response: &'static str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    #[test]
    fn only_local_addresses_skip_certificate_checks() {
        assert!(local_address("http://127.0.0.1:8384"));
        assert!(local_address("https://localhost:8384"));
        assert!(local_address("https://[::1]:8384"));
        assert!(local_address("http://192.168.1.20:8384"));
        assert!(local_address("http://172.16.0.5:8384"));
        assert!(!local_address("https://example.com"));
        assert!(!local_address("https://172.40.0.5:8384"));
    }

    #[tokio::test]
    async fn reads_json_from_a_local_endpoint() {
        let port = serve_once("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}");
        let value = sync_get_at(&format!("http://127.0.0.1:{}", port), "/rest/config", "k").await.expect("request");
        assert_eq!(value["ok"], serde_json::json!(true));
    }

    #[tokio::test]
    async fn a_rejected_key_says_so() {
        let port = serve_once("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
        let err = sync_get_at(&format!("http://127.0.0.1:{}", port), "/rest/config", "k").await.unwrap_err();
        assert!(err.contains("rejected the API key"), "{}", err);
    }

    #[tokio::test]
    async fn nothing_listening_is_an_error_not_a_panic() {
        let port = {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let err = sync_get_at(&format!("http://127.0.0.1:{}", port), "/rest/noauth/health", "").await.unwrap_err();
        assert!(err.contains("error sending request") || err.contains("Connect"), "{}", err);
    }
}
