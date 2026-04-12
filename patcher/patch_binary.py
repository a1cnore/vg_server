#!/usr/bin/env python3
"""
patch_binary.py — Patch Vainglory server domain strings in the GameKindred Mach-O binary.

Replaces hardcoded VG server domains with a target IP so the game
connects directly to our proxy server. No runtime DNS hooks needed.

Usage:
    python3 patch_binary.py --binary path/to/GameKindred --ip 192.168.64.1
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


# Each entry: (search_bytes, build_replacement_fn)
# The replacement function takes (original_bytes, ip) and returns bytes of SAME length.

def _patch_standalone_host(original: bytes, ip: str) -> bytes:
    """Replace standalone 'platform.superevil.net' with IP, null-padded."""
    replacement = ip.encode("ascii")
    if len(replacement) > len(original):
        raise ValueError(
            f"IP '{ip}' ({len(replacement)} bytes) is longer than "
            f"'{original.decode()}' ({len(original)} bytes)"
        )
    return replacement + b"\x00" * (len(original) - len(replacement))


def _patch_url_domain(original: bytes, ip: str) -> bytes:
    """Replace the domain portion of a URL string, keep the path, null-pad."""
    text = original.decode("ascii")

    # Find the domain to replace (between :// and next /)
    # For strings like "http://preauth.superevil.net/kindred/live/..."
    #   or "http://gamefeeds.superevilmegacorp.net/server-status..."
    proto_end = text.find("://")
    if proto_end == -1:
        raise ValueError(f"No :// found in '{text}'")
    proto_end += 3  # skip "://"

    slash = text.find("/", proto_end)
    if slash == -1:
        # No path, just replace the domain
        domain = text[proto_end:]
        path = ""
    else:
        domain = text[proto_end:slash]
        path = text[slash:]

    new_text = text[:proto_end] + ip + path
    if len(new_text) > len(original):
        raise ValueError(
            f"Replacement URL '{new_text}' ({len(new_text)} bytes) is longer than "
            f"original ({len(original)} bytes)"
        )
    return new_text.encode("ascii") + b"\x00" * (len(original) - len(new_text))


def _patch_amplitude(original: bytes, _ip: str) -> bytes:
    """Replace amplitude URL with 0.0.0.0 to kill analytics."""
    new_text = "https://0.0.0.0/"
    return new_text.encode("ascii") + b"\x00" * (len(original) - len(new_text))


PATCHES = [
    {
        "name": "platform host (standalone)",
        "search": b"platform.superevil.net",
        "context_exclude": b"environment:",  # skip the log string variant
        "build": _patch_standalone_host,
    },
    {
        "name": "preauth URL",
        "search": b"http://preauth.superevil.net/kindred/live/[REVISION]-status-redirect",
        "context_exclude": None,
        "build": _patch_url_domain,
    },
    {
        "name": "gamefeeds URL",
        "search": b"http://gamefeeds.superevilmegacorp.net/server-status-redirect.[LANG]",
        "context_exclude": None,
        "build": _patch_url_domain,
    },
    {
        "name": "amplitude URL",
        "search": b"https://api.amplitude.com/",
        "context_exclude": None,
        "build": _patch_amplitude,
    },
]


def find_string_offset(data: bytes, search: bytes, context_exclude: bytes | None) -> int | None:
    """Find a null-terminated string in the binary, optionally excluding matches
    that are preceded by a context string (e.g., 'environment:')."""
    start = 0
    while True:
        idx = data.find(search, start)
        if idx == -1:
            return None

        if context_exclude:
            # Check the bytes before this match for the exclusion pattern
            lookback = max(0, idx - 64)
            # Walk backward to find the start of this null-terminated string
            str_start = idx
            while str_start > 0 and data[str_start - 1] != 0:
                str_start -= 1
            preceding = data[str_start:idx]
            if context_exclude in preceding:
                start = idx + 1
                continue

        return idx

    return None


def patch_binary(binary_path: Path, ip: str, dry_run: bool = False) -> bool:
    data = bytearray(binary_path.read_bytes())
    patched_any = False

    for patch in PATCHES:
        search = patch["search"]
        name = patch["name"]
        offset = find_string_offset(bytes(data), search, patch["context_exclude"])

        if offset is None:
            print(f"  SKIP  {name}: string not found (already patched?)")
            continue

        replacement = patch["build"](search, ip)
        assert len(replacement) == len(search), \
            f"Replacement length mismatch: {len(replacement)} != {len(search)}"

        old_str = data[offset:offset + len(search)].decode("ascii", errors="replace")
        new_str = replacement.rstrip(b"\x00").decode("ascii", errors="replace")

        if dry_run:
            print(f"  WOULD {name}: '{old_str}' -> '{new_str}' at 0x{offset:x}")
        else:
            data[offset:offset + len(search)] = replacement
            print(f"  PATCH {name}: '{old_str}' -> '{new_str}' at 0x{offset:x}")
            patched_any = True

    if patched_any and not dry_run:
        binary_path.write_bytes(bytes(data))
        print(f"\nWritten: {binary_path}")

    # Verify: scan for any remaining original domains
    final = bytes(data)
    remaining = []
    for patch in PATCHES:
        if find_string_offset(final, patch["search"], patch["context_exclude"]) is not None:
            remaining.append(patch["name"])
    if remaining and not dry_run:
        print(f"\nWARNING: these strings still present: {remaining}")
    elif not dry_run and patched_any:
        print("Verified: all target strings patched successfully")

    return patched_any


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch VG server domains in GameKindred binary")
    parser.add_argument("--binary", required=True, help="Path to GameKindred binary")
    parser.add_argument("--ip", required=True, help="Server IP to patch in")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be patched without writing")
    args = parser.parse_args()

    binary_path = Path(args.binary)
    if not binary_path.is_file():
        print(f"Error: binary not found: {binary_path}", file=sys.stderr)
        return 1

    ip = args.ip
    # Validate IP length fits in the longest domain we replace
    if len(ip) > len("platform.superevil.net"):
        print(f"Error: IP '{ip}' is too long (max {len('platform.superevil.net')} chars)", file=sys.stderr)
        return 1

    print(f"Binary: {binary_path}")
    print(f"Target: {ip}")
    print(f"Mode:   {'dry run' if args.dry_run else 'LIVE'}")
    print()

    patched = patch_binary(binary_path, ip, dry_run=args.dry_run)

    if args.dry_run:
        print("\nDry run complete. No files modified.")
    elif not patched:
        print("\nNothing to patch — binary may already be patched.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
