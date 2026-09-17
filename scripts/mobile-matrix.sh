#!/bin/sh
#
# Capture a screen's four appearance cells on the booted iOS simulator:
# light and dark, at the default text size and at accessibility extra-large.
#
#   scripts/mobile-matrix.sh <screen>[-<role>]
#
# Leave the app on the screen you want to capture. Between shots the script
# flips the simulator's appearance and content size and relaunches the app:
# React Native only re-measures text for a new content size on a fresh
# launch, so a live switch leaves most of the page at the old size. The
# relaunch lands on the last route for an authenticated session and on the
# login screen otherwise; drive back to the screen if it does not. Cells
# land as <screen>-ios-<theme>-<scale>.png via scripts/mobile-shot.sh.
#
# The app's own Appearance preference (Profile > Appearance) wins over the
# simulator's setting; keep it on System while capturing.

set -e

SCREEN=$1
if [ -z "$SCREEN" ]; then
  echo "usage: scripts/mobile-matrix.sh <screen>[-<role>]" >&2
  exit 1
fi

DIR=$(cd "$(dirname "$0")" && pwd)
BUNDLE_ID=${MOBILE_BUNDLE_ID:-com.dubgrid.mobile}
RELAUNCH_WAIT=${MOBILE_RELAUNCH_WAIT:-10}

relaunch() {
  xcrun simctl terminate booted "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch booted "$BUNDLE_ID" >/dev/null
  sleep "$RELAUNCH_WAIT"
}

for THEME in light dark; do
  xcrun simctl ui booted appearance "$THEME"
  for SCALE in default ax; do
    if [ "$SCALE" = ax ]; then
      xcrun simctl ui booted content_size accessibility-extra-large
    else
      xcrun simctl ui booted content_size large
    fi
    relaunch
    "$DIR/mobile-shot.sh" "$SCREEN-ios-$THEME-$SCALE"
  done
done

xcrun simctl ui booted appearance light
xcrun simctl ui booted content_size large
relaunch
