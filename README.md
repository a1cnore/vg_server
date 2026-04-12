# vg_server

Local Vainglory server tooling for redirecting an iOS client to a self-hosted endpoint, proxying the bootstrap RPC flow, serving synthetic push/social data, and capturing live match traffic.

## Current status

This repo is in a useful but still experimental state.

- The binary patcher works by replacing hardcoded backend domains in `GameKindred` with a target IP.
- The local iPhone test loop is wired up: patch IPA, optionally sign it, start the Dockerized server, and serve the IPA over HTTP.
- The bootstrap / platform RPC path is intercepted through `mitmproxy` on ports `443` and `8000`.
- A lightweight WebSocket push server runs on `2112` and can feed state-update style notifications to the client.
- Match sessions can be rerouted through a local TCP proxy on `9000`, with per-match packet capture written to disk.
- Some responses are synthetic or replay-oriented rather than full backend implementations.
- In-match traffic decryption is not generally solved here. The force-key path is exploratory and may fail against the real server.

## What it can do

- Patch a client binary to point at your server IP instead of the original Vainglory hosts.
- Start a reverse-proxy style bootstrap server for Vainglory JSON-RPC traffic.
- Log structured RPC traffic to `server/data/vg_traffic.jsonl`.
- Inject synthetic social data such as friend list, leaderboard, and party state.
- Run a push channel compatible with the client's WebSocket connection shape.
- Detect match start / match endpoint updates and spin up a TCP capture proxy automatically.
- Save raw per-match packet captures and metadata under `server/data/matches/`.

## Current limitations

- This is not a full replacement backend for Vainglory.
- IPA build flow depends on assets from the sibling `../vgf` checkout.
- Signed IPA output depends on an external IPAPatch/Xcode setup.
- `local.sh` assumes a macOS-style environment for Wi-Fi IP detection (`ipconfig getifaddr en0`).
- The repo currently includes local runtime data under `server/data/`; treat that as captured output, not stable source.

## Repo layout

- `patcher/patch_binary.py`: patches backend host strings in the Mach-O binary.
- `patcher/build_ipa.sh`: copies `Payload/`, patches the binary, and packages an IPA.
- `local.sh`: local dev helper for patching, optional signing, server startup, and IPA hosting.
- `server/vg_interceptor.py`: `mitmproxy` addon for JSON-RPC interception, logging, and response shaping.
- `server/vg_push_server.py`: stdlib-only WebSocket push server for client notifications.
- `server/vg_game_proxy.py`: in-match TCP proxy and packet logger.
- `server/docker-compose.yml`: container entrypoint for the local server stack.

## Ports

- `443`: bootstrap / session RPC reverse proxy
- `8000`: platform RPC reverse proxy
- `2112`: WebSocket push server
- `9000`: match TCP proxy
- `8080`: local IPA download server when using `local.sh`

## Quick start

Prerequisites:

- Docker
- Python 3
- A sibling `../vgf` checkout containing `Payload/` and `scripts/serve_ipa_site.py`
- Optional: Xcode + IPAPatch for signed IPA output

Common commands:

```bash
make help
make server IP=192.168.1.5
make ipa IP=192.168.1.5
./local.sh
./local.sh --sign
```

For the all-in-one local flow on the same Wi-Fi network:

```bash
./local.sh
```

That flow will:

1. Detect or accept a target LAN IP.
2. Patch the client binary.
3. Build an unsigned IPA.
4. Optionally build a signed IPA if IPAPatch is available.
5. Start the server stack with Docker.
6. Serve the IPA over HTTP on port `8080`.

## Output and logs

- RPC traffic: `server/data/vg_traffic.jsonl`
- Match captures: `server/data/matches/<timestamp>_<matchid>/`
- Match metadata: `match_meta.json`
- Raw packets: `packets.bin`
- Hex preview: `packets.txt`

## Notes

This repo is best understood as a working research harness for client redirection, traffic observation, and protocol experimentation. The strongest implemented pieces today are binary patching, bootstrap interception, push/social simulation, and packet capture.
