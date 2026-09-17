#!/bin/sh
#
# Capture one cell of the mobile qualification matrix.
#
#   scripts/mobile-shot.sh <cell>            # booted iOS simulator
#   scripts/mobile-shot.sh --android <cell>  # connected Android emulator
#
# Writes blueprint/reference/mobile/<cell>.png, downscaled to 800px wide so
# the repository stays small, and prints the path. Name cells
# <screen>-<platform>-<theme>-<text scale>[-<role>|-<state>], e.g.
# dashboard-ios-dark-ax-admin or request-sheet-ios-light-default-user.
#
# Drive the app to the state you want first; this only takes the picture.

set -e

ROOT=$(git rev-parse --show-toplevel)
OUT_DIR="$ROOT/blueprint/reference/mobile"
PLATFORM=ios

if [ "$1" = "--android" ]; then
  PLATFORM=android
  shift
fi

CELL=$1
if [ -z "$CELL" ]; then
  echo "usage: scripts/mobile-shot.sh [--android] <cell>" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/$CELL.png"

if [ "$PLATFORM" = ios ]; then
  xcrun simctl io booted screenshot --type=png "$OUT" >/dev/null 2>&1
else
  adb exec-out screencap -p > "$OUT"
fi

# 800 wide keeps a 3x capture legible while cutting it to a fifth of its size.
sips -Z 800 "$OUT" >/dev/null

echo "$OUT"
