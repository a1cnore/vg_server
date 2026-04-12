#!/bin/bash
set -euo pipefail

#
# local.sh — Local dev flow for testing on iPhone (same WiFi).
#
# Patches the binary, starts Docker, serves the IPA.
# Use --sign to also build a signed IPA via IPAPatch/Xcode.
#
# Usage:
#   ./local.sh                  # auto-detect WiFi IP, unsigned IPA
#   ./local.sh 192.168.1.5      # override IP
#   ./local.sh --sign           # also build signed IPA via IPAPatch
#   ./local.sh --sign-only      # only build signed IPA (skip server)
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VGF_DIR="$(dirname "$SCRIPT_DIR")/vgf"
DIST_DIR="$SCRIPT_DIR/dist"
PATCHER="$SCRIPT_DIR/patcher/patch_binary.py"
SERVE_IPA="$VGF_DIR/scripts/serve_ipa_site.py"
IPPATCH_DIR="/Users/marvinkleinpass/Developer/ippatch/IPAPatch-Vainglory"

C_RESET="\033[0m"
C_BOLD="\033[1m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_DIM="\033[2m"

step()  { echo "${C_GREEN}[+]${C_RESET} $1"; }
info()  { echo "${C_DIM}[*]${C_RESET} $1"; }
warn()  { echo "${C_YELLOW}[!]${C_RESET} $1"; }
header() { echo ""; echo "${C_BOLD}── $1 ──${C_RESET}"; }

# ── Parse args ──

SIGN=false
SIGN_ONLY=false
IP=""

for arg in "$@"; do
    case "$arg" in
        --sign)      SIGN=true ;;
        --sign-only) SIGN=true; SIGN_ONLY=true ;;
        *)           IP="$arg" ;;
    esac
done

# ── Detect WiFi IP ──

if [ -z "$IP" ]; then
    IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [ -z "$IP" ]; then
        warn "Could not detect WiFi IP (en0). Pass it as argument:"
        warn "  ./local.sh 192.168.x.x"
        exit 1
    fi
fi
step "WiFi IP: $IP"

# ── Build patched IPA ──

header "Building patched IPA"

mkdir -p "$DIST_DIR"
WORK_DIR="$DIST_DIR/.work"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

step "Copying Payload from vgf (latest binary + dylibs)..."
cp -R "$VGF_DIR/Payload" "$WORK_DIR/Payload"
find "$WORK_DIR/Payload" -name ".DS_Store" -delete 2>/dev/null || true

step "Patching binary → $IP"
python3 "$PATCHER" \
    --binary "$WORK_DIR/Payload/GameKindred.app/GameKindred" \
    --ip "$IP"

# Build unsigned IPA
step "Packaging unsigned IPA..."
cd "$WORK_DIR"
rm -f "$DIST_DIR/Vainglory_local.ipa"
zip -r -q "$DIST_DIR/Vainglory_local.ipa" Payload/
cd "$SCRIPT_DIR"
step "Unsigned: dist/Vainglory_local.ipa ($(du -h "$DIST_DIR/Vainglory_local.ipa" | cut -f1))"

# ── Signed IPA via IPAPatch ──

if [ "$SIGN" = true ]; then
    header "Building signed IPA via IPAPatch"

    if [ ! -d "$IPPATCH_DIR" ]; then
        warn "IPAPatch not found at: $IPPATCH_DIR"
        warn "Skipping signed build."
    else
        # Replace IPAPatch source IPA with our patched version
        step "Injecting patched IPA into IPAPatch..."
        cp "$DIST_DIR/Vainglory_local.ipa" "$IPPATCH_DIR/Assets/app.ipa"

        step "Building with Xcode (this takes a moment)..."
        xcodebuild build \
            -project "$IPPATCH_DIR/IPAPatch.xcodeproj" \
            -scheme "IPAPatch-DummyApp" \
            -configuration Release \
            -destination "generic/platform=iOS" \
            -allowProvisioningUpdates \
            CODE_SIGN_STYLE=Automatic \
            2>&1 | tail -5

        # Find the built product
        BUILD_DIR=$(xcodebuild -project "$IPPATCH_DIR/IPAPatch.xcodeproj" \
            -scheme "IPAPatch-DummyApp" \
            -configuration Release \
            -showBuildSettings 2>/dev/null | grep " BUILT_PRODUCTS_DIR" | awk '{print $3}')

        if [ -d "$BUILD_DIR/IPAPatch-DummyApp.app" ]; then
            step "Packaging signed IPA..."
            rm -rf "$DIST_DIR/SignedPayload"
            mkdir -p "$DIST_DIR/SignedPayload"
            cp -R "$BUILD_DIR/IPAPatch-DummyApp.app" "$DIST_DIR/SignedPayload/"
            cd "$DIST_DIR"
            rm -f Vainglory_signed.ipa
            # IPAPatch renames to IPAPatch-DummyApp.app, package as-is
            mv SignedPayload Payload
            zip -r -q Vainglory_signed.ipa Payload/
            rm -rf Payload
            cd "$SCRIPT_DIR"
            step "Signed: dist/Vainglory_signed.ipa"
        fi

        # Also check IPAPatch's own Product dir
        if [ -f "$IPPATCH_DIR/Product/"*.ipa ]; then
            IPPATCH_IPA=$(ls -1 "$IPPATCH_DIR/Product/"*.ipa | head -1)
            cp "$IPPATCH_IPA" "$DIST_DIR/Vainglory_signed.ipa"
            step "Signed: dist/Vainglory_signed.ipa (from IPAPatch Product)"
        fi
    fi
fi

# Clean up work dir
rm -rf "$WORK_DIR"

if [ "$SIGN_ONLY" = true ]; then
    echo ""
    step "Done. Install dist/Vainglory_signed.ipa on your device."
    exit 0
fi

# ── Check Docker ──

if ! command -v docker &>/dev/null; then
    warn "Docker not found — skipping server start."
    warn "Install Docker Desktop or OrbStack, then run: make server IP=$IP"
elif ! docker info &>/dev/null 2>&1; then
    warn "Docker not running — skipping server start."
    warn "Start OrbStack/Docker Desktop, then run: make server IP=$IP"
else
    header "Starting server"
    export VG_HOST_IP="$IP"
    docker compose -f server/docker-compose.yml up --build -d
    step "Server running at $IP (ports 443, 8000, 2112, 9000)"
fi

# ── Serve IPA ──

header "Serving IPA"

# Serve the signed IPA if available, otherwise unsigned
if [ -f "$DIST_DIR/Vainglory_signed.ipa" ] && [ "$SIGN" = true ]; then
    SERVE_FILE="$DIST_DIR/Vainglory_signed.ipa"
    info "Serving signed IPA"
else
    SERVE_FILE="$DIST_DIR/Vainglory_local.ipa"
    info "Serving unsigned IPA (use --sign for signed)"
fi

echo ""
echo "   ${C_BOLD}http://$IP:8080/${C_RESET}"
echo ""
info "Ctrl+C to stop IPA server (Docker keeps running)"
echo ""

python3 "$SERVE_IPA" --ipa "$SERVE_FILE" --port 8080
