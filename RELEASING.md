# Releasing Atonacht

## 1. Version

```bash
node scripts/bump-version.mjs 0.2.0     # package.json, tauri.conf.json and Cargo.toml together
git commit -am "Release 0.2.0" && git tag v0.2.0 && git push --tags
```

Pushing the tag runs `.github/workflows/release.yml`. It builds Windows, macOS and Linux installers into a **draft** GitHub release, and a signed Android APK that is attached to the same draft. Check the draft, then publish it.

`.github/workflows/ci.yml` runs on every push and pull request: type-check, tests, web build, and the Rust tests.

## 2. Android signing key (once)

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

**Keep `atonacht-release.jks` and its password somewhere safe and backed up.** Android only installs an update if it is signed with the same key, so losing it means a new app identity.

## 3. Where to publish

- **Side-loading (simplest):** attach the APK to the GitHub release. People install it by hand and update by hand.
- **F-Droid:** suits this app (no tracking, no proprietary services). Store text is in `fastlane/metadata/android/en-US/`. F-Droid builds from source, so the repository needs a licence file: **choose a licence before submitting**, I have not picked one for you. Check F-Droid's current inclusion rules, since the Tauri build and the Rust and npm dependencies are things reviewers look at.
- **Google Play:** needs a developer account, a store listing, screenshots, and a privacy policy. The app asks for notification and exact alarm permissions (reminders). Play restricts exact alarms and the folder-access features, so read the current policy and declare them accurately. Not tried here.
- **Desktop installers:** Windows and macOS builds are unsigned unless you add certificates. Unsigned apps show a warning on first run. See the Tauri docs on code signing and notarisation.

## 4. Before the first public release

- Run it on a real phone and computer (see "Not checked" in the README).
- Replace the placeholder app identifier `app.atonacht.notes` in `src-tauri/tauri.conf.json` if you own a different domain. Changing it later changes the app's identity.
- Decide the licence, then add `LICENSE` and mention it in the README.
