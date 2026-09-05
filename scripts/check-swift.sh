#!/usr/bin/env bash
#
# Typecheck the native packages that DRAW without Xcode.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
# `swiftc -typecheck` used to run over the Capacitor widget extension; that
# extension is gone (Wave 5) and the tiles now live in `native/Packages/OnyxUI`,
# a real SwiftPM package that depends on OnyxCore. A package cross-builds for
# the iOS simulator from the command line — no project, no signing, no
# simulator booted — so the same "does it compile" signal survives the move,
# and it now covers OnyxCore as a side effect.
#
# ── WHAT IT DOES NOT COVER ───────────────────────────────────────────────────
# OnyxData (Supabase + GRDB — `npm run swift:data` owns it), the app target and
# the widget extension target (both need `xcodebuild`, see the plan's §9), and
# anything about LAYOUT: a tile that compiles can still draw badly, and no
# compiler has an opinion about that. The shot loop does.
set -euo pipefail

if ! command -v xcrun >/dev/null 2>&1; then
  echo "swift check: xcrun not found — skipping (this is a macOS + Xcode check)"
  exit 0
fi

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null || true)"
if [ -z "$SDK" ]; then
  echo "swift check: no iPhoneSimulator SDK — skipping"
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# A scratch path OUTSIDE the repo, like `swift:core` and `swift:data`, so the
# build products never land in git and PyCharm never indexes them.
if ! out=$(swift build \
  --package-path "$ROOT/native/Packages/OnyxUI" \
  --scratch-path "$HOME/Library/Caches/onyx-swift/OnyxUI-ios" \
  --triple arm64-apple-ios18.0-simulator \
  --sdk "$SDK" 2>&1); then
  echo "$out" | grep -v "warning: using sysroot" | grep -E "error|warning|note" || echo "$out" | tail -20
  exit 1
fi
echo "✔ OnyxUI + OnyxCore build for the iOS simulator"
