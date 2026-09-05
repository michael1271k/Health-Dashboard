#!/usr/bin/env bash
#
# The native visual-check loop: one PNG per screen, at the default text size and
# at the largest accessibility size.
#
# ── WHY NOT `ImageRenderer` AND A SNAPSHOT LIBRARY ──────────────────────────
# The whole design mandate for this app is material: `ultraThinMaterial` tiles,
# a mesh bleed behind the title, blur that samples what is behind it. Those are
# composited by the render server, and an off-screen `ImageRenderer` pass does
# not have one — a "screenshot" from it shows the layout and lies about the look,
# which is precisely the half a design review is for.
#
# So this boots a real simulator, installs a real build and asks the OS for a
# real screenshot. It is slower and it is the truth.
#
# ── AND WHY A LAUNCH ARGUMENT RATHER THAN A DEEP LINK ───────────────────────
# The plan's Wave 0 sketch used `helix://open?path=`. A deep link has to travel
# through the app's real navigation, which means a real session, which means
# Supabase credentials in the loop and screenshots that differ by whatever is in
# the database today. `--helix-screen` swaps the root view for one screen backed
# by seeded in-memory data, so the shot is deterministic and needs no network.
# It is `#if DEBUG` only and cannot ship.
#
#   scripts/native-shot.sh you             # one screen
#   scripts/native-shot.sh all             # every screen the harness knows
#
set -euo pipefail

SCREEN="${1:-all}"
DEVICE="${2:-iPhone 17 Pro}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# `SHOT_OUT` sends the PNGs somewhere else — App Store shots go to a
# per-size folder rather than over the committed visual-diff set.
OUT="${SHOT_OUT:-$ROOT/native/__screenshots__}"
BUNDLE_ID="app.helix.health.michael.native"
DERIVED="$HOME/Library/Caches/helix-swift/shot-derived"

mkdir -p "$OUT"

# ── The device ─────────────────────────────────────────────────────────────
UDID="$(xcrun simctl list devices available | grep -m1 "$DEVICE (" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
if [ -z "$UDID" ]; then
  echo "No available simulator named '$DEVICE'." >&2
  exit 1
fi
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null

# ── The build ──────────────────────────────────────────────────────────────
# Never `-sdk iphoneos`: it drags a watch AppIcon check into an iPhone-only
# project and fails on an asset that does not exist.
echo "Building…"
(cd "$ROOT/native" && xcodegen generate >/dev/null)
xcodebuild -project "$ROOT/native/HelixNative.xcodeproj" \
  -scheme HelixNative \
  -configuration Debug \
  -destination "id=$UDID" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build >/dev/null

APP="$DERIVED/Build/Products/Debug-iphonesimulator/HelixNative.app"
xcrun simctl install "$UDID" "$APP"

# ── The shots ──────────────────────────────────────────────────────────────
# Dynamic Type is mandatory in this design system and the largest accessibility
# size is where fixed heights and truncated labels show up, so every screen is
# shot twice and both PNGs are committed.
shoot() {
  local screen="$1" size="$2" suffix="$3"
  xcrun simctl ui "$UDID" content_size "$size" >/dev/null
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" --helix-screen "$screen" >/dev/null
  # The launch returns as soon as the process exists; the first frame is a
  # few hundred ms later. Shooting too early photographs the launch screen.
  sleep 3.5
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/$screen$suffix.png" >/dev/null
  echo "  $OUT/$screen$suffix.png"
}

# A space-separated list shoots several screens off ONE build, which is what
# the store loop wants: `native-shot.sh "today train fuel" "iPhone 17 Pro Max"`.
read -ra SCREENS <<< "$SCREEN"
if [ "$SCREEN" = "all" ]; then
  # Keep in step with `PreviewHarness.Screen` — the harness is the authority and
  # an unknown name there renders a visible error rather than failing silently.
  SCREENS=(signin backfill today today-edit today-sheet today-sheet-vitals train logger logger-finish day day-rows day-empty day-inbody day-swap doms fuel fuel-over fuel-empty nutrients macro-edit you levers sync-status sync-doctor plan body volume library exercise reports report history history-week session session-ledger exercise-history trends trends-empty body-trends body-trends-empty widgets)
fi

# `widgets` is a contact sheet of every tile; the harness pages it because a
# scroll view screenshots its first screen only. Page count = WidgetPreviews.pages.
if [ "$SCREEN" = "widgets" ] || [ "$SCREEN" = "all" ]; then
  SCREENS=("${SCREENS[@]/widgets}")
  for i in $(seq 0 17); do SCREENS+=("widgets-$i"); done
  SCREENS+=("widgets-activity")
fi

for s in "${SCREENS[@]}"; do
  [ -z "$s" ] && continue
  echo "$s"
  shoot "$s" medium ""
  # Tiles set their type in points, as WidgetKit does; Dynamic Type never
  # reaches them, so the AX5 shot would be the same PNG twice.
  case "$s" in widgets*) continue ;; esac
  # `SHOT_AX=0` for the App Store loop: Apple wants the shipping type size,
  # and a second PNG per screen at AX5 is just something to delete by hand.
  [ "${SHOT_AX:-1}" = "1" ] || continue
  shoot "$s" accessibility-extra-extra-extra-large "-ax5"
done

xcrun simctl ui "$UDID" content_size medium >/dev/null
echo
echo "git diff --stat native/__screenshots__   # the visual diff"
