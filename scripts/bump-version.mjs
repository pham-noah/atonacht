#!/usr/bin/env node
// Usage: node scripts/bump-version.mjs 0.2.0   (updates package.json, tauri.conf.json and Cargo.toml together)
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) {
  console.error("Give a version like 0.2.0");
  process.exit(1);
}
const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
edit("package.json", (s) => s.replace(/("version":\s*")[^"]+/, `$1${v}`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/("version":\s*")[^"]+/, `$1${v}`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = ".*"$/m, `version = "${v}"`));
// Cargo.lock records the crate's own version too; leaving it behind makes the next `cargo build` dirty the tree.
try {
  edit("src-tauri/Cargo.lock", (s) =>
    s.replace(/(\[\[package\]\]\nname = "atonacht"\nversion = ")[^"]+/, `$1${v}`),
  );
} catch {
  // no lock file yet (never built here): nothing to update
}
console.log(`Version is now ${v}. Commit, then: git tag v${v} && git push --tags`);
