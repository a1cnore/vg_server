IP ?= 192.168.64.1

# ── Server ──────────────────────────────────────────────

server:              ## Start server locally (foreground)
	VG_HOST_IP=$(IP) docker compose -f server/docker-compose.yml up --build

server-bg:           ## Start server in background
	VG_HOST_IP=$(IP) docker compose -f server/docker-compose.yml up --build -d

server-logs:         ## Tail server logs
	docker compose -f server/docker-compose.yml logs -f

server-restart:      ## Restart server (picks up code changes)
	docker compose -f server/docker-compose.yml restart

server-down:         ## Stop server
	docker compose -f server/docker-compose.yml down

# ── IPA ─────────────────────────────────────────────────

ipa:                 ## Build patched IPA for given IP
	./patcher/build_ipa.sh $(IP)

ipa-check:           ## Verify patched binary strings
	@strings patched/Payload/GameKindred.app/GameKindred | grep -E "superevil|amplitude" || echo "(clean — no original domains found)"
	@strings patched/Payload/GameKindred.app/GameKindred | grep "$(IP)" && echo "Server IP found in binary" || echo "WARNING: server IP not found"

serve-ipa:           ## Serve IPA for device download
	python3 ../vgf/scripts/serve_ipa_site.py --ipa patched/Vainglory_dist.ipa

# ── Local dev (iPhone on same WiFi) ─────────────────────

WIFI_IP := $(shell ipconfig getifaddr en0 2>/dev/null || echo "unknown")

local:               ## Local flow: patch + server + serve (unsigned)
	./local.sh

local-sign:          ## Local flow: patch + sign via IPAPatch + server + serve
	./local.sh --sign

local-sign-only:     ## Just build signed IPA (no server)
	./local.sh --sign-only

local-serve:         ## Serve local IPA for iPhone download
	@if [ -f dist/Vainglory_signed.ipa ]; then \
		python3 ../vgf/scripts/serve_ipa_site.py --ipa dist/Vainglory_signed.ipa --port 8080; \
	else \
		python3 ../vgf/scripts/serve_ipa_site.py --ipa dist/Vainglory_local.ipa --port 8080; \
	fi

# ── Remote / generic ────────────────────────────────────

dev: server-bg ipa serve-ipa ## server + ipa + serve (uses IP variable)

dry-run:             ## Show what would be patched (no changes)
	@rm -rf /tmp/vg_dryrun && mkdir -p /tmp/vg_dryrun
	@cp ../vgf/Payload/GameKindred.app/GameKindred /tmp/vg_dryrun/
	python3 patcher/patch_binary.py --binary /tmp/vg_dryrun/GameKindred --ip $(IP) --dry-run
	@rm -rf /tmp/vg_dryrun

clean:               ## Remove patched output
	rm -rf patched/Payload patched/*.ipa

# ── Help ────────────────────────────────────────────────

help:                ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: server server-bg server-logs server-restart server-down ipa ipa-check serve-ipa local local-sign local-sign-only local-serve dev dry-run clean help
.DEFAULT_GOAL := help
