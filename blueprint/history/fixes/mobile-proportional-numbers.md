# Fix: The app's numbers use Inter's proportional figures

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-proportional-numbers`

## The problem

Item 24 set every operational number in the app (dates, times, hours,
counts, badges) in tabular figures, where each digit takes the same width.
The owner prefers Inter's own proportional figures (2026-11-02).

## The fix

- Every `mobileTabularText` spread and the two tab strips' own
  `fontVariant: ["tabular-nums"]` are removed (19 files), and so is the
  `mobileTabularText` token.
- `typography-contract.test.ts` now fails if any app file sets
  `tabular-nums`, in place of the test that required it.
- The coding standards, `apps/mobile/AGENTS.md` and the project overview
  say the web keeps tabular figures for schedule data and the app doesn't.
  `project-plan.md` and `build-plan.md`, the owner's, still say tabular.

## Checks

- Mobile type-check, lint, and every mobile test (1560).
- iOS 26.5 Simulator: the Schedule header, Home and the People list.
- Not checked: Android, a physical phone.
