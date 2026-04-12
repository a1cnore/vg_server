#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VGF_DIR="$(dirname "$PROJECT_DIR")/vgf"
PATCHED_DIR="$PROJECT_DIR/patched"
PATCHER="$SCRIPT_DIR/patch_binary.py"

IP="${1:?Usage: build_ipa.sh <SERVER_IP>}"

echo "[+] Building distributable IPA for server $IP"
echo "    Source:  $VGF_DIR/Payload"
echo "    Output:  $PATCHED_DIR"
echo ""

# 1. Fresh copy of Payload from vgf
echo "[1/3] Copying Payload from vgf..."
rm -rf "$PATCHED_DIR/Payload"
cp -R "$VGF_DIR/Payload" "$PATCHED_DIR/Payload"

# Remove .DS_Store files
find "$PATCHED_DIR/Payload" -name ".DS_Store" -delete 2>/dev/null || true

# 2. Patch the binary
echo ""
echo "[2/3] Patching binary..."
python3 "$PATCHER" \
    --binary "$PATCHED_DIR/Payload/GameKindred.app/GameKindred" \
    --ip "$IP"

# 3. Package IPA
echo ""
echo "[3/3] Packaging IPA..."
IPA_NAME="Vainglory_dist.ipa"
cd "$PATCHED_DIR"
rm -f "$IPA_NAME"
zip -r -q "$IPA_NAME" Payload/

echo ""
echo "[+] Done: $PATCHED_DIR/$IPA_NAME"
echo "    Server: $IP"
echo "    Size:   $(du -h "$IPA_NAME" | cut -f1)"
