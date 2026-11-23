# Releasing Atonacht

## 1. Version

```bash
node scripts/bump-version.mjs 0.3.0     # package.json, tauri.conf.json, Cargo.toml and Cargo.lock together
npm test && cargo test --manifest-path src-tauri/Cargo.toml
git commit -am "Release 0.3.0" && git tag v0.3.0 && git push && git push --tags
```

The version in `package.json` is the one the app shows in About and the one its update check compares against, so it is
bumped before the tag: `vite.config.ts` reads it into `__APP_VERSION__`.

Pushing the tag runs `.github/workflows/release.yml`. It builds Windows, macOS and Linux installers into a **draft**
GitHub release, and signed Android APKs (one per ABI) that are attached to the same draft.

`.github/workflows/ci.yml` runs on every push and pull request: type-check, tests, web build, and the Rust tests.

## 2. The draft release

The draft arrives with an empty body. Write the notes by hand in the shape `v0.2.0` uses — a title sentence, then a bolded
sentence per change — and check every claim against the commits since the last tag:

```bash
git log --oneline v0.2.0..HEAD
gh release view v0.2.0 --json body -q .body      # the shape to match
gh release edit v0.3.0 --draft=false             # publish
```

**A draft is invisible to the app's update check** (it asks `/releases/latest`), so nobody is offered a release until the
draft is published. Publish first, announce after.

For F-Droid and Play the per-version "what's new" text sits beside the store metadata, under 500 characters:
`fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.

## 3. Android signing key (once)

```bash
keytool -genkey -v -keystore atonacht-release.jks -alias atonacht -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 atonacht-release.jks    # copy this output
```

Add three repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 text above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `atonacht` |

**Keep `atonacht-release.jks` and its password somewhere safe and backed up.** Android only installs an update if it is signed with the same key, so losing it means a new app identity. The key used so far lives in `Atonacht-keys/` (git-ignored).

## 4. Where to publish

- **Side-loading (simplest):** the APK is attached to the GitHub release. People install it by hand and update by hand.
- **F-Droid:** suits this app (no tracking, no proprietary services). Store text is in `fastlane/metadata/android/en-US/`, and the licence is Apache-2.0, which F-Droid accepts. It builds from source, so check its current inclusion rules against the Tauri build and the Rust and npm dependencies.
- **Google Play:** needs a developer account, a store listing, screenshots and a privacy policy. The app asks for notification and exact alarm permissions (reminders) and for SAF folder access; Play restricts exact alarms, so declare the use accurately. Not tried here.
- **Desktop installers:** Windows and macOS builds are unsigned unless you add certificates. Unsigned apps show a warning on first run. See the Tauri docs on code signing and notarisation.

## 5. Before the first public release

- Run it on a real phone and computer. CI builds both; nothing here has watched a reminder arrive on a physical Android device (see "Known limits" in the README).
- Replace the placeholder app identifier `app.atonacht.notes` in `src-tauri/tauri.conf.json` if you own a different domain. Changing it later changes the app's identity, which breaks updates.
