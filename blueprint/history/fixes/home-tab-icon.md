# Fix: The app opens on "This tab ran into a problem"

**Type:** Fix
**Status:** verified
**Branch:** `fix/home-tab-icon`

## The problem

On the iPhone every launch showed "This tab ran into a problem" instead of
the tabs (owner, 2026-11-03). react-native-screens threw "To use
selectedIcon prop, the icon prop must also be provided". Home was the only
tab drawing an Ionicons glyph: expo-router loads a vector icon's normal and
selected images separately, and when the selected one arrived first the
tab bar was handed a selected icon with no normal one.

## The fix

- Home uses SF Symbols like the other tabs (`house`, `house.fill`), which
  need no loading, so both images are there on the first render.

## Checks

- Mobile type-check, lint, and the tabs layout test, which now expects an SF Symbol on every tab.
- iOS 26.5 Simulator, Debug build: the error showed on launch before the
  fix and the tabs open after it.
- Android is unchanged; its tab bar never used the vector icon.
