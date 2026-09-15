# iOS sticky headers show no visible bottom edge, unlike Android

**Type:** Fix
**Status:** verified

## The problem

On iOS, the mobile app's sticky page header (Home's greeting header, Schedule's
date-strip header, etc.) has no perceptible boundary between the header and
content scrolling underneath it, confirmed via screenshots on two iOS devices.
Android shows a clearly visible edge in the same spot.

`mobileElevationTokens.header` (`packages/design-tokens/src/elevation.ts`) is
the shared "header" elevation level. It intentionally replaced an older 1pt
`borderSubtle` divider with shadow alone (recorded in the file's own comment:
"nothing but this shadow tells the reader that content is passing underneath
it"). The two platforms read different parts of the same token: iOS honors
`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` (currently a very
soft, wide blur at 10% opacity), while Android honors only `elevation` (4),
whose native shadow renderer draws a much crisper, more visible edge at the
same nominal "level." The light-mode token's iOS values are too soft to read
as a boundary at all, so the design's own stated intent (the shadow _is_ the
separation) fails specifically on iOS.

## The fix

Two parts, found by verifying on-device rather than guessing from the code
alone:

1. A first attempt at just strengthening the light-mode `header` shadow values
   had no visible effect on-device. The real cause: `Screen.tsx`'s
   `stickyHeaderShell` puts `overflow: "hidden"` (needed to clip the header's
   own content) on the _same_ view that carries the shadow style. On iOS,
   `overflow: "hidden"` clips anything drawn outside the view's bounds,
   shadows included — so the shadow was being clipped away entirely,
   regardless of its values. Android's `elevation` isn't affected the same
   way, which is exactly why Android showed a boundary and iOS didn't.
2. Split the floating (scroll-under) sticky header into two nested views: an
   outer `stickyHeaderShadow` wrapper that carries only positioning and the
   shadow, and the existing `stickyHeaderShell` (now shadow-free) nested
   inside it carrying `overflow: "hidden"` and the header's own content
   clipping. The non-scrolling header variant (nothing passes beneath it)
   keeps its shadow inline on `nonScrollStickyHeaderShell`, unaffected by the
   clipping bug since there's no scrolled content depending on it.
   `mobileElevationTokens.header`'s light-mode iOS shadow values were also
   tightened (`shadowOpacity` 0.1→0.22, `shadowRadius` 14→4, `shadowOffset`
   height 4→2) now that they're actually rendering, for a crisper edge closer
   to Android's. Dark mode's existing values were left untouched — they were
   already tuned harder for this exact purpose and just needed to stop being
   clipped.

## Build steps

- [x] **Step 1 - Un-clip and strengthen the iOS header shadow.** Split
      `Screen.tsx`'s floating sticky-header shell into an unclipped shadow
      wrapper and a clipped content view; tightened the light-mode `header`
      elevation token. Done when a Home or Schedule screen's sticky header shows
      a clearly visible bottom edge on an iOS simulator screenshot, comparably
      prominent to Android's, with no other elevation level or the non-scrolling
      header variant changed in behavior.

## Verification

- iOS simulator screenshots (ground-truth, via `xcrun simctl io screenshot`)
  of three different sticky headers (Home week view, Schedule, Home day view)
  before and after, confirming a clearly visible full-width shadow edge where
  there was none.
- `npm run test:mobile` (138 files / 1117 tests) and
  `@dubgrid/design-tokens`'s own suite (33 tests, includes elevation-adjacent
  contrast checks) pass.
- `npx tsc --noEmit` (apps/mobile) clean.
