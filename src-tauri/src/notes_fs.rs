//! Plain file-system operations for the notes folder. No Tauri types here, so it can be unit tested alone.
//! Every path coming from the UI is relative to the notes root and is validated by `safe_join`.

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub path: String,
    pub is_dir: bool,
    pub mtime: u64,
    pub size: u64,
}

pub fn default_root() -> String {
    if cfg!(target_os = "android") {
        return "/storage/emulated/0/Documents/Atonacht".to_string();
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    Path::new(&home).join("Documents").join("Atonacht").to_string_lossy().into_owned()
}

/// Joins `rel` onto `root`, refusing absolute paths and `..` so the UI can never leave the notes folder.
pub fn safe_join(root: &str, rel: &str) -> Result<PathBuf, String> {
    if root.trim().is_empty() {
        return Err("No notes folder set".into());
    }
    let mut out = PathBuf::from(root);
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            _ => return Err(format!("Path not allowed: {rel}")),
        }
    }
    Ok(out)
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_markdown(p: &Path) -> bool {
    p.extension().map(|e| e.eq_ignore_ascii_case("md")).unwrap_or(false)
}

/// True for paths the app cares about: notes and folders, not hidden files (.trash, .stfolder, temp files).
pub fn is_visible_path(base: &Path, p: &Path) -> bool {
    let Ok(rel) = p.strip_prefix(base) else { return false };
    let mut any = false;
    for c in rel.components() {
        if let Component::Normal(s) = c {
            any = true;
            if s.to_string_lossy().starts_with('.') {
                return false;
            }
        }
    }
    any && (is_markdown(p) || p.extension().is_none())
}

pub fn ensure_root(root: &str) -> Result<(), String> {
    fs::create_dir_all(safe_join(root, "")?).map_err(|e| format!("Could not open the notes folder: {e}"))
}

/// All folders and .md files under the root. Hidden items (.trash, .stfolder, .stversions, ...) are skipped.
pub fn list_entries(root: &str) -> Result<Vec<Entry>, String> {
    let base = safe_join(root, "")?;
    let mut out = Vec::new();
    walk(&base, &base, &mut out).map_err(|e| format!("Could not read the notes folder: {e}"))?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn walk(base: &Path, dir: &Path, out: &mut Vec<Entry>) -> std::io::Result<()> {
    for item in fs::read_dir(dir)? {
        let item = item?;
        let name = item.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let path = item.path();
        let meta = item.metadata()?;
        let rel = path.strip_prefix(base).unwrap().components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        if meta.is_dir() {
            out.push(Entry { path: rel, is_dir: true, mtime: 0, size: 0 });
            walk(base, &path, out)?;
        } else if is_markdown(&path) {
            out.push(Entry { path: rel, is_dir: false, mtime: mtime_ms(&meta), size: meta.len() });
        }
    }
    Ok(())
}

pub fn read_note(root: &str, rel: &str) -> Result<String, String> {
    fs::read_to_string(safe_join(root, rel)?).map_err(|e| format!("Could not read {rel}: {e}"))
}

/// Writes via a temporary file in the same folder, then renames, so a sync app never sees a half-written note.
pub fn write_note(root: &str, rel: &str, content: &str) -> Result<u64, String> {
    let target = safe_join(root, rel)?;
    if !is_markdown(&target) {
        return Err("Only .md notes can be written".into());
    }
    let dir = target.parent().ok_or("Bad path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let name = target.file_name().unwrap().to_string_lossy().into_owned();
    // A name of its own per write: two saves of one note (an editor flush and a checkbox, say) must not write into the
    // same temporary file, or the rename could publish a mix of both.
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp = dir.join(format!(".{name}.{stamp}-{:?}.atonacht-tmp", std::thread::current().id()));
    let mut f = fs::File::create(&tmp).map_err(|e| format!("Could not write {rel}: {e}"))?;
    f.write_all(content.as_bytes()).and_then(|_| f.sync_all()).map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, &target).map_err(|e| format!("Could not save {rel}: {e}"))?;
    Ok(mtime_ms(&fs::metadata(&target).map_err(|e| e.to_string())?))
}

/// Binary attachments (an image pasted into a note) go through the same temporary-file dance as notes, so a sync app
/// never copies half a picture. Base64 keeps the IPC payload a string.
pub fn write_bytes(root: &str, rel: &str, base64_data: &str) -> Result<u64, String> {
    use base64::Engine;
    let target = safe_join(root, rel)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("That is not valid base64: {e}"))?;
    let dir = target.parent().ok_or("Bad path")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let name = target.file_name().unwrap().to_string_lossy().into_owned();
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp = dir.join(format!(".{name}.{stamp}-{:?}.atonacht-tmp", std::thread::current().id()));
    let mut f = fs::File::create(&tmp).map_err(|e| format!("Could not write {rel}: {e}"))?;
    f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, &target).map_err(|e| format!("Could not save {rel}: {e}"))?;
    Ok(mtime_ms(&fs::metadata(&target).map_err(|e| e.to_string())?))
}

/// The bytes of an attachment, as base64, for showing it in the web view.
pub fn read_bytes(root: &str, rel: &str) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(safe_join(root, rel)?).map_err(|e| format!("Could not read {rel}: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

pub fn make_dir(root: &str, rel: &str) -> Result<(), String> {
    fs::create_dir_all(safe_join(root, rel)?).map_err(|e| format!("Could not create {rel}: {e}"))
}

/// "Plan.md" -> "Plan (trashed 1730200000).md". The time lives in the name because file dates can't say when a note was deleted,
/// and a name survives being synced to other devices.
pub fn stamp_name(name: &str, secs: u64) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => format!("{stem} (trashed {secs}).{ext}"),
        _ => format!("{name} (trashed {secs})"),
    }
}

/// Reverses `stamp_name`. Also understands the older "<seconds>-name.md" form. Returns (original name, deleted-at seconds).
pub fn unstamp_name(name: &str) -> (String, Option<u64>) {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    if let Some(head) = stem.strip_suffix(')') {
        if let Some((base, secs)) = head.rsplit_once(" (trashed ") {
            if let Ok(n) = secs.parse::<u64>() {
                return (format!("{base}{ext}"), Some(n));
            }
        }
    }
    if let Some((n, rest)) = name.split_once('-') {
        if n.len() >= 9 && n.chars().all(|c| c.is_ascii_digit()) && !rest.is_empty() {
            return (rest.to_string(), n.parse().ok());
        }
    }
    (name.to_string(), None)
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Never deletes: moves the note into <root>/.trash/ with the deletion time in its name, so it can be recovered or expire later.
pub fn trash_note(root: &str, rel: &str) -> Result<(), String> {
    let src = safe_join(root, rel)?;
    let (dir, file) = match rel.rsplit_once('/') {
        Some((d, f)) => (format!("{d}/"), f.to_string()),
        None => (String::new(), rel.to_string()),
    };
    let mut secs = now_secs();
    let mut dest = safe_join(root, &format!(".trash/{dir}{}", stamp_name(&file, secs)))?;
    while dest.exists() {
        secs += 1; // two deletions of the same name in one second
        dest = safe_join(root, &format!(".trash/{dir}{}", stamp_name(&file, secs)))?;
    }
    fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::rename(&src, &dest).map_err(|e| format!("Could not move {rel} to trash: {e}"))
}

/// Removes an empty folder. Refuses if it still holds notes.
pub fn remove_dir(root: &str, rel: &str) -> Result<(), String> {
    fs::remove_dir(safe_join(root, rel)?).map_err(|e| format!("Could not remove folder {rel}: {e}"))
}

/// Notes currently in <root>/.trash, with paths relative to the trash folder.
pub fn list_trash(root: &str) -> Result<Vec<Entry>, String> {
    let base = safe_join(root, ".trash")?;
    if !base.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    walk(&base, &base, &mut out).map_err(|e| format!("Could not read the trash: {e}"))?;
    out.retain(|e| !e.is_dir);
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Puts a trashed note back where it came from. Never overwrites: a clash becomes "name (restored).md", and a second
/// clash "name (restored 2).md" (fs::rename replaces on Linux and Android, so the check has to be a real loop).
pub fn restore_note(root: &str, trash_rel: &str) -> Result<String, String> {
    let src = safe_join(root, &format!(".trash/{trash_rel}"))?;
    let (dir, file) = match trash_rel.rsplit_once('/') {
        Some((d, f)) => (format!("{d}/"), f),
        None => (String::new(), trash_rel),
    };
    let back = unstamp_name(file).0;
    let mut rel = format!("{dir}{back}");
    if safe_join(root, &rel)?.exists() {
        let (stem, ext) = match back.rsplit_once('.') {
            Some((s, e)) if !s.is_empty() && !e.is_empty() => (s.to_string(), format!(".{e}")),
            _ => (back.clone(), String::new()),
        };
        let mut n = 1;
        loop {
            let name = if n == 1 { format!("{stem} (restored){ext}") } else { format!("{stem} (restored {n}){ext}") };
            let candidate = format!("{dir}{name}");
            if !safe_join(root, &candidate)?.exists() {
                rel = candidate;
                break;
            }
            n += 1;
        }
    }
    let dest = safe_join(root, &rel)?;
    fs::create_dir_all(dest.parent().ok_or("Bad path")?).map_err(|e| e.to_string())?;
    fs::rename(&src, &dest).map_err(|e| format!("Could not restore {trash_rel}: {e}"))?;
    prune_trash_dirs(root, &src);
    Ok(rel)
}

/// Deletes a trashed note for good.
pub fn purge_note(root: &str, trash_rel: &str) -> Result<(), String> {
    let src = safe_join(root, &format!(".trash/{trash_rel}"))?;
    fs::remove_file(&src).map_err(|e| format!("Could not delete {trash_rel}: {e}"))?;
    prune_trash_dirs(root, &src);
    Ok(())
}

fn prune_trash_dirs(root: &str, from: &Path) {
    let trash = match safe_join(root, ".trash") {
        Ok(t) => t,
        Err(_) => return,
    };
    let mut dir = from.parent().map(|p| p.to_path_buf());
    while let Some(d) = dir {
        if d == trash || !d.starts_with(&trash) || fs::remove_dir(&d).is_err() {
            break;
        }
        dir = d.parent().map(|p| p.to_path_buf());
    }
}

pub fn rename_note(root: &str, from: &str, to: &str) -> Result<(), String> {
    let src = safe_join(root, from)?;
    let dest = safe_join(root, to)?;
    if dest.exists() {
        return Err(format!("{to} already exists"));
    }
    fs::create_dir_all(dest.parent().ok_or("Bad path")?).map_err(|e| e.to_string())?;
    fs::rename(src, dest).map_err(|e| format!("Could not rename {from}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> String {
        let p = std::env::temp_dir().join(format!("atonacht-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn rejects_paths_that_escape_the_root() {
        assert!(safe_join("/notes", "../secret.md").is_err());
        assert!(safe_join("/notes", "/etc/passwd").is_err());
        assert!(safe_join("/notes", "a/../../b.md").is_err());
        assert_eq!(safe_join("/notes", "a/b.md").unwrap(), PathBuf::from("/notes/a/b.md"));
        assert!(safe_join("", "a.md").is_err());
    }

    #[test]
    fn writes_reads_and_lists_notes() {
        let root = temp_root("rw");
        write_note(&root, "Daily notes/2026-10-29.md", "# Hi\n- [ ] one\n").unwrap();
        write_note(&root, "top.md", "x").unwrap();
        fs::write(Path::new(&root).join("image.png"), b"png").unwrap();
        fs::create_dir_all(Path::new(&root).join(".stfolder")).unwrap();
        make_dir(&root, "Empty folder").unwrap();
        assert_eq!(read_note(&root, "Daily notes/2026-10-29.md").unwrap(), "# Hi\n- [ ] one\n");
        let paths: Vec<_> = list_entries(&root).unwrap().into_iter().map(|e| (e.path, e.is_dir)).collect();
        assert_eq!(
            paths,
            vec![
                ("Daily notes".to_string(), true),
                ("Daily notes/2026-10-29.md".to_string(), false),
                ("Empty folder".to_string(), true),
                ("top.md".to_string(), false),
            ]
        );
        // no temp files left behind
        let leftovers = fs::read_dir(Path::new(&root).join("Daily notes")).unwrap().count();
        assert_eq!(leftovers, 1);
    }

    #[test]
    fn only_writes_markdown() {
        let root = temp_root("md");
        assert!(write_note(&root, "script.sh", "x").is_err());
    }

    #[test]
    fn trash_moves_instead_of_deleting_and_handles_repeats() {
        let root = temp_root("trash");
        write_note(&root, "a.md", "one").unwrap();
        trash_note(&root, "a.md").unwrap();
        assert!(list_entries(&root).unwrap().is_empty());
        let first = list_trash(&root).unwrap();
        assert_eq!(first.len(), 1);
        assert!(first[0].path.starts_with("a (trashed ") && first[0].path.ends_with(").md"));
        assert_eq!(fs::read_to_string(Path::new(&root).join(".trash").join(&first[0].path)).unwrap(), "one");
        write_note(&root, "a.md", "two").unwrap();
        trash_note(&root, "a.md").unwrap(); // same name, same second: still gets its own file
        assert_eq!(fs::read_dir(Path::new(&root).join(".trash")).unwrap().count(), 2);
    }

    #[test]
    fn restores_and_purges_from_the_trash() {
        let root = temp_root("restore");
        write_note(&root, "Games/idea.md", "one").unwrap();
        trash_note(&root, "Games/idea.md").unwrap();
        write_note(&root, "Games/idea.md", "two").unwrap();
        trash_note(&root, "Games/idea.md").unwrap(); // second copy gets a timestamp prefix
        let trashed: Vec<_> = list_trash(&root).unwrap().into_iter().map(|e| e.path).collect();
        assert_eq!(trashed.len(), 2);
        assert!(trashed.iter().all(|p| p.starts_with("Games/idea (trashed ")));
        // the earlier deletion comes back under its own name; the later one must not overwrite it
        assert_eq!(restore_note(&root, &trashed[0]).unwrap(), "Games/idea.md");
        assert_eq!(restore_note(&root, &trashed[1]).unwrap(), "Games/idea (restored).md");
        assert_eq!(read_note(&root, "Games/idea.md").unwrap(), "one");
        assert_eq!(read_note(&root, "Games/idea (restored).md").unwrap(), "two");
        assert!(list_trash(&root).unwrap().is_empty());
        assert!(!Path::new(&root).join(".trash/Games").exists()); // empty folders are tidied away
        write_note(&root, "gone.md", "x").unwrap();
        trash_note(&root, "gone.md").unwrap();
        let gone = list_trash(&root).unwrap().remove(0).path;
        purge_note(&root, &gone).unwrap();
        assert!(list_trash(&root).unwrap().is_empty());
        assert!(purge_note(&root, "../etc/passwd").is_err());
    }

    #[test]
    fn watcher_ignores_hidden_and_non_notes() {
        let b = Path::new("/n");
        assert!(is_visible_path(b, Path::new("/n/a.md")));
        assert!(is_visible_path(b, Path::new("/n/Games/b.MD")));
        assert!(is_visible_path(b, Path::new("/n/Games"))); // folders (no extension)
        assert!(!is_visible_path(b, Path::new("/n/.trash/a.md")));
        assert!(!is_visible_path(b, Path::new("/n/.a.md.atonacht-tmp")));
        assert!(!is_visible_path(b, Path::new("/n/photo.png")));
        assert!(!is_visible_path(b, Path::new("/elsewhere/a.md")));
        assert!(!is_visible_path(b, Path::new("/n")));
    }

    #[test]
    fn lists_thousands_of_notes_quickly() {
        let root = temp_root("many");
        for d in 0..30 {
            for i in 0..100 {
                write_note(&root, &format!("Folder {d}/note {i}.md"), "# x\n- [ ] a\n").unwrap();
            }
        }
        let t = std::time::Instant::now();
        let entries = list_entries(&root).unwrap();
        let ms = t.elapsed().as_millis();
        assert_eq!(entries.iter().filter(|e| !e.is_dir).count(), 3000);
        assert!(ms < 2000, "listing 3000 notes took {ms} ms");
        eprintln!("listed 3000 notes in {ms} ms");
    }

    #[test]
    fn restoring_a_third_copy_gives_it_a_name_of_its_own() {
        let root = temp_root("restore3");
        for body in ["one", "two", "three"] {
            write_note(&root, "idea.md", body).unwrap();
            trash_note(&root, "idea.md").unwrap();
        }
        let trashed: Vec<_> = list_trash(&root).unwrap().into_iter().map(|e| e.path).collect();
        assert_eq!(trashed.len(), 3);
        let a = restore_note(&root, &trashed[0]).unwrap();
        let b = restore_note(&root, &trashed[1]).unwrap();
        let c = restore_note(&root, &trashed[2]).unwrap();
        assert_eq!(a, "idea.md");
        assert_eq!(b, "idea (restored).md");
        assert_eq!(c, "idea (restored 2).md");
        // nothing was lost to a rename that replaces: all three versions are on disk
        let mut seen = vec![read_note(&root, &a).unwrap(), read_note(&root, &b).unwrap(), read_note(&root, &c).unwrap()];
        seen.sort();
        assert_eq!(seen, vec!["one".to_string(), "three".to_string(), "two".to_string()]);
    }

    #[test]
    fn saving_one_note_from_two_threads_leaves_one_complete_version() {
        let root = temp_root("race");
        let long = "a".repeat(200_000);
        let other = "b".repeat(200_000);
        std::thread::scope(|s| {
            for body in [&long, &other] {
                let (root, body) = (root.clone(), body.clone());
                s.spawn(move || write_note(&root, "same.md", &body).unwrap());
            }
        });
        let saved = read_note(&root, "same.md").unwrap();
        assert!(saved == long || saved == other, "the note holds a mix of two saves");
        // and no temporary files are left behind
        assert_eq!(fs::read_dir(&root).unwrap().filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().contains("atonacht-tmp")).count(), 0);
    }

    #[test]
    fn trash_names_round_trip() {
        assert_eq!(stamp_name("Plan.md", 1730200000), "Plan (trashed 1730200000).md");
        assert_eq!(unstamp_name("Plan (trashed 1730200000).md"), ("Plan.md".to_string(), Some(1730200000)));
        assert_eq!(unstamp_name("My (trashed) idea.md"), ("My (trashed) idea.md".to_string(), None));
        assert_eq!(unstamp_name("1730200000-old.md"), ("old.md".to_string(), Some(1730200000))); // older format
        assert_eq!(unstamp_name("plain.md"), ("plain.md".to_string(), None));
        assert_eq!(unstamp_name(&stamp_name("v1.2 notes.md", 1730200000)).0, "v1.2 notes.md");
    }

    #[test]
    fn removes_only_empty_folders() {
        let root = temp_root("rmdir");
        write_note(&root, "Full/a.md", "x").unwrap();
        make_dir(&root, "Empty").unwrap();
        assert!(remove_dir(&root, "Full").is_err());
        remove_dir(&root, "Empty").unwrap();
        assert!(!Path::new(&root).join("Empty").exists());
    }

    #[test]
    fn rename_refuses_to_overwrite() {
        let root = temp_root("rename");
        write_note(&root, "a.md", "A").unwrap();
        write_note(&root, "b.md", "B").unwrap();
        assert!(rename_note(&root, "a.md", "b.md").is_err());
        rename_note(&root, "a.md", "Sub/c.md").unwrap();
        assert_eq!(read_note(&root, "Sub/c.md").unwrap(), "A");
    }
}
