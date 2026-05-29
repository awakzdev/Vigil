#!/usr/bin/env bash
# Build VigilRemediationRunner deployment zip (canonical: remediation_runner.py).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${ROOT}/remediation_runner.zip"
STAGE="${ROOT}/.build"
rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE"
cp "${ROOT}/remediation_runner.py" "${STAGE}/index.py"
python3 -m pip install --quiet --target "$STAGE" cryptography
cd "$STAGE" && zip -qr "$OUT" .
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
