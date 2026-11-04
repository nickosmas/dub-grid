# Fix: Alerts has a large title that collapses on scroll

**Type:** Fix
**Status:** verified
**Branch:** `fix/alerts-large-title`

## The problem

Alerts showed a small "Alerts" beside the back button rather than a large
title (owner, 2026-11-03). It had been given one on 2026-11-01 (#265) because
on a cold push iOS 26 drew the stacked search field over a large title.

## The fix

- Alerts uses the large title, which collapses into the bar on scroll, with
  the search field under it.
- The route declares the search field (iOS only), so it exists while the
  push lays out the title, and the list stays scrollable while it loads.
  Each alone still left the field over the title on a cold push.
- `HeaderLeadingTitle` has no users left.
- Collapsed, the title is centered, as iOS draws every collapsed large
  title.

## Checks

- Mobile type-check, lint, and the notifications and entry tests (131).
- iPhone 17 Pro Max, production build: the first open after a launch
  draws the large title with the search field under it (owner,
  2026-11-03).
- iOS 26.5 Simulator, development build: the first open after a launch
  still draws the search field over the title until the page is touched;
  later opens are right. Development builds open a screen slowly the first
  time, which a production build does not.
- Android is unchanged: it keeps its own top app bar and docked search.
