#!/usr/bin/env bash
# Upload a fresh Statbel building permits ZIP to the GitHub Release cache and trigger the workflow.
# Run this locally when Statbel publishes new data (GitHub Actions cannot reach statbel.fgov.be).
#
# Usage: ./scripts/upload_statbel_bouwvergunningen_cache.sh [path/to/TF_BUILDING_PERMITS.zip]
#   If no file is given, downloads from Statbel first.

set -euo pipefail

REPO="gehuybre/embuild-analyses"
RELEASE_TAG="statbel-bouwvergunningen-cache"
STATBEL_URL="https://statbel.fgov.be/sites/default/files/files/opendata/Building%20permits/TF_BUILDING_PERMITS.zip"
DEFAULT_DEST="/tmp/TF_BUILDING_PERMITS.zip"

ZIP_PATH="${1:-}"

if [ -z "${ZIP_PATH}" ]; then
  echo "Downloading from Statbel..."
  curl -fsSL --retry 3 -o "${DEFAULT_DEST}" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
    "${STATBEL_URL}"
  ZIP_PATH="${DEFAULT_DEST}"
  echo "Downloaded to ${ZIP_PATH}"
fi

if [ ! -f "${ZIP_PATH}" ]; then
  echo "File not found: ${ZIP_PATH}" >&2
  exit 1
fi

echo "Uploading ${ZIP_PATH} to release ${RELEASE_TAG}..."
if gh release view "${RELEASE_TAG}" --repo "${REPO}" > /dev/null 2>&1; then
  gh release upload "${RELEASE_TAG}" "${ZIP_PATH}" --repo "${REPO}" --clobber
else
  gh release create "${RELEASE_TAG}" "${ZIP_PATH}" \
    --repo "${REPO}" \
    --title "Statbel bouwvergunningen data cache" \
    --notes "Cached copy of TF_BUILDING_PERMITS.zip from statbel.fgov.be. GitHub Actions runners cannot reach statbel.fgov.be directly, so this release is used as a download proxy." \
    --prerelease
fi

echo "Upload done. Triggering workflow..."
gh workflow run update-vergunningen-goedkeuringen-data.yml --ref main --repo "${REPO}"
echo "Workflow triggered. Done."
