# Fix: iPhone Duo - the tab bar shows when the app starts open

**Type:** Fix
**Status:** verified
**Branch:** `fix/duo-open-launch-tab-bar`

### The problem

Started while the iPhone Duo was open or partly folded, the app showed no tab
bar until the phone was folded and unfolded. An `lldb` dump of the window
showed the `UITabBar` in place in the side column (882, 0, 69 x 669), so
UIKit built it but iOS 26's floating tab bar, drawn by a SwiftUI host, never
rendered. Hiding and showing the tab bar through `lldb` brought it back, as
the size-class change of a fold and unfold does.

### The fix

`app/(tabs)/_layout.tsx` hides the tab bar once and shows it on the next
frame when the tabs route finishes its entrance (`transitionEnd`, opening) on
a regular-width screen (744 pt and wider). Timing tests showed why it has to
wait for the entrance: on a cold start the tabs slide in from the launch route
for about 2.4 s, and a hide and show during that slide (300 ms steps) changed
nothing, while one after it worked. `sidebarAdaptable={false}` (the explicit
`tabBar` controller mode) was tried first and made no difference.

### Build steps

- [x] **1. Nudge the tab bar after a wide entrance.**
      **Done when:** cold launches open (three in a row) and partly folded show
      the tab bar; closed and held tall are unchanged.

### Verify

- iPhone Duo simulator, cold launches: open x3, partly folded, closed and held
  tall all show the tab bar. Every tab, a person page and a sheet captured in
  all four poses.
- `npm run test:mobile` (1,801 tests), `npm run type-check`, eslint on the
  changed file.
