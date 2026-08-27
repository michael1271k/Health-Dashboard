#!/usr/bin/env bash
#
# Typecheck the widget extension without Xcode.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
# Every Swift change in Wave B shipped unverified, because "no Xcode here" was
# taken to mean "no Swift compiler here". It does not. `swiftc -typecheck`
# against the iOS SDK does the entire type-checking pass — the phase that
# catches overload resolution going somewhere unexpected, which is exactly the
# class of bug that broke the build:
#
#   `s?.date.flatMap { … }`   the chain belongs to `s`, so `flatMap` was
#                             Sequence's, over the String's Characters
#   `max(0, self)` in `extension Int`   resolved to the static `Int.max`
#
# Both compiled fine in a human's head and neither is visible to a regex.
#
# ── WHAT IT DOES NOT COVER ───────────────────────────────────────────────────
# The APP target (`ios/App/App/*.swift`) imports `Capacitor`, which is a Pod and
# has no `.swiftmodule` until something has actually built. Those files still
# need Xcode. So does anything about LAYOUT: a face that typechecks can still
# draw badly, and no compiler has an opinion about that.
#
# Nor is it a link or a build — no SwiftUI view bodies are evaluated, no assets
# are resolved, no Info.plist is read.
set -euo pipefail

if ! command -v xcrun >/dev/null 2>&1; then
  echo "swift check: xcrun not found — skipping (this is a macOS + Xcode check)"
  exit 0
fi

SDK="$(xcrun --sdk iphoneos --show-sdk-path 2>/dev/null || true)"
if [ -z "$SDK" ]; then
  echo "swift check: no iPhoneOS SDK — skipping"
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# `Shared/` first: it is not in the extension's synchronized group, but it is a
# target member, and the widget sources are meaningless without it.
#
# ALL of Shared, not a named file. This listed `HelixSnapshot.swift` alone, so
# when `HelixLiveActivity.swift` joined the directory the check started failing
# on every run with `cannot find type 'HelixWorkoutAttributes' in scope` — a
# permanent red that says nothing about the code being checked. A glob cannot
# fall behind the directory the way a hand-kept list does, and `Shared/` is
# small and wholly a member of this target by definition.
xcrun swiftc -typecheck \
  -sdk "$SDK" \
  -target arm64-apple-ios17.0 \
  "$ROOT"/ios/App/Shared/*.swift \
  "$ROOT"/ios/App/HelixWidgets/*.swift

echo "✔ Swift widget extension typechecks"
