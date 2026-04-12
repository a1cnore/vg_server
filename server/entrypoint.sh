#!/bin/bash
set -e

# Auto-detect public IP if not set
if [ -z "$VG_HOST_IP" ]; then
    VG_HOST_IP="$(curl -s4 --connect-timeout 3 ifconfig.me 2>/dev/null || echo 192.168.64.1)"
fi
export VG_HOST_IP
export VG_GAME_PROXY_PORT="${VG_GAME_PROXY_PORT:-9000}"
export VG_LOG_DIR="${VG_LOG_DIR:-/app/data}"

mkdir -p "$VG_LOG_DIR/matches"

echo "=========================================="
echo " VG Server"
echo "=========================================="
echo " HOST_IP:         $VG_HOST_IP"
echo " GAME_PROXY_PORT: $VG_GAME_PROXY_PORT"
echo " LOG_DIR:         $VG_LOG_DIR"
echo " Ports:           443, 8000, 2112, $VG_GAME_PROXY_PORT"
echo "=========================================="

cleanup() {
    echo "[vg-server] shutting down..."
    kill $PID_443 $PID_8000 $PID_PUSH 2>/dev/null
    wait $PID_443 $PID_8000 $PID_PUSH 2>/dev/null
    echo "[vg-server] stopped"
}
trap cleanup EXIT INT TERM

# mitmproxy :443 (session bootstrap — startSessionForPlayer etc.)
mitmdump \
    --mode reverse:https://rpc.kindred-live.net:443/ \
    --listen-host 0.0.0.0 --listen-port 443 \
    --ssl-insecure \
    --set block_global=false \
    --set keep_host_header=true \
    -s vg_interceptor.py 2>&1 | sed 's/^/[443]  /' &
PID_443=$!

# mitmproxy :8000 (platform RPC — createGuestPlayer, getPlayerForGuestAccount etc.)
mitmdump \
    --mode reverse:https://rpc.kindred-live.net:443/ \
    --listen-host 0.0.0.0 --listen-port 8000 \
    --ssl-insecure \
    --set block_global=false \
    --set keep_host_header=true \
    -s vg_interceptor.py 2>&1 | sed 's/^/[8000] /' &
PID_8000=$!

# Push server :2112
python3 vg_push_server.py --host 0.0.0.0 --port 2112 &
PID_PUSH=$!

echo "[vg-server] all services started, waiting..."
wait
