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
            set_privacy_flags
        ]);

    // Fingerprint / face unlock exists on phones only.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Atonacht");
}
