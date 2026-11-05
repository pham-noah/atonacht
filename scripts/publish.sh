#!/usr/bin/env bash
# Put Atonacht 0.1.0 on GitHub: create the repo, push main and the tag, and store the Android signing secrets so the
# release workflow can build and sign an APK.
#
#   gh auth login          # once, in your browser
#   bash scripts/publish.sh [--public]
#
# The keystore never leaves this machine except as a GitHub secret (base64), which is how the workflow expects it.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${REPO:-pham-noah/atonacht}"
VISIBILITY="--private"
[ "${1:-}" = "--public" ] && VISIBILITY="--public"
KS="Atonacht-keys/atonacht-release.jks"
PW="Atonacht-keys/release-password.txt"

command -v gh >/dev/null || { echo "gh is not installed: winget install GitHub.cli" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "not signed in: run 'gh auth login'" >&2; exit 1; }
[ -f "$KS" ] || { echo "missing $KS" >&2; exit 1; }
[ -f "$PW" ] || { echo "missing $PW" >&2; exit 1; }

# 1. the repo itself
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "repo $REPO already exists"
else
  gh repo create "$REPO" "$VISIBILITY" --source=. --remote=origin --description "Notes, tasks and boards in Markdown on your own devices"
fi

# 2. history and the release tag
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
git push -u origin HEAD:main
git push origin --tags

# 3. the secrets release.yml reads for the Android job
base64 -w0 "$KS" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO" < "$PW"
gh secret set ANDROID_KEY_ALIAS --repo "$REPO" --body "atonacht"

echo
echo "done: https://github.com/$REPO"
gh run list --repo "$REPO" --limit 3 || true
