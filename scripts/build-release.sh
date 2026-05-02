#!/usr/bin/env bash
#
# vertalen — release build script
#
# Produces release/vertalen-<version>.zip ready for the GitHub Release.
# Performs a defense-in-depth secret scan first so an accidental
# committed key never makes it into a public release.
#
# Usage:
#   ./scripts/build-release.sh
#
# Exits non-zero on:
#   - Secret-scan match
#   - Missing extension/ folder
#   - Missing or unparseable manifest.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$ROOT/extension"
RELEASE_DIR="$ROOT/release"

if [[ ! -d "$EXT_DIR" ]]; then
  echo "error: $EXT_DIR not found" >&2
  exit 1
fi

if [[ ! -f "$EXT_DIR/manifest.json" ]]; then
  echo "error: manifest.json not found in $EXT_DIR" >&2
  exit 1
fi

VERSION="$(node -e "process.stdout.write(require('$EXT_DIR/manifest.json').version)" 2>/dev/null || true)"
if [[ -z "$VERSION" ]]; then
  VERSION="$(grep -E '"version"\s*:' "$EXT_DIR/manifest.json" | head -n 1 | sed -E 's/.*"version"\s*:\s*"([^"]+)".*/\1/')"
fi

if [[ -z "$VERSION" ]]; then
  echo "error: could not determine version from manifest.json" >&2
  exit 1
fi

echo "==> Building vertalen v$VERSION"

echo "==> Scanning for accidental secrets in extension/"
# Strict: only matches real hex tokens (team_<16+ hex chars>) so the
# documented placeholder team_xxxxxxxxxxxxxxxx (only 'x' characters)
# does not produce a false positive.
PATTERNS=(
  'team_[a-f0-9]{16,}'
  'Bearer\s+team_[a-f0-9]{16,}'
)

FOUND=0
for pattern in "${PATTERNS[@]}"; do
  if grep -RIEn --binary-files=without-match "$pattern" "$EXT_DIR" 2>/dev/null; then
    FOUND=1
  fi
done

if [[ "$FOUND" -ne 0 ]]; then
  echo ""
  echo "ERROR: secret-like pattern detected in extension/. Aborting release." >&2
  echo "       Remove the secret and re-run this script." >&2
  exit 1
fi
echo "    OK — no secret patterns found."

mkdir -p "$RELEASE_DIR"
ARCHIVE="$RELEASE_DIR/vertalen-$VERSION.zip"
rm -f "$ARCHIVE"

echo "==> Creating $ARCHIVE"
(cd "$ROOT" && zip -r "$ARCHIVE" "extension" \
  -x "extension/icons/icon-source.png" \
  -x "*.DS_Store" \
  -x "**/.DS_Store" \
  > /dev/null)

SIZE="$(du -h "$ARCHIVE" | awk '{print $1}')"
echo "==> Done. $ARCHIVE ($SIZE)"
echo ""
echo "Next steps:"
echo "  1. Test by loading extension/ as an unpacked extension."
echo "  2. Upload $ARCHIVE to a GitHub Release tagged v$VERSION."
echo "  3. Paste the release URL into README.md and DEMO.md."
