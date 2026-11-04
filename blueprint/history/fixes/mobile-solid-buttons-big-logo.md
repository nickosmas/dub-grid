# Fix: Solid primary buttons and a larger logo on sign-in and onboarding

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-solid-buttons-big-logo`
**Design reference:** the "Mobile button types" canvas (owner, 2026-11-04)

## The problem

- The main action on every screen (Continue, Sign in, Save) was a soft blue
  fill with blue text, which read too light.
- The logo on sign-in and onboarding was a small 20pt lockup.

## The fix

- `primary` buttons are solid blue-600 (`buttonPrimaryBg`) with a white
  label, across the app. `secondary` keeps the soft blue as the step down
  beside it; the other tones are unchanged.
- Sign-in, forgot and reset password, and onboarding show the lockup at
  30pt, left-aligned with the wordmark to the right of the symbol (owner,
  2026-11-04, after a centered stacked lockup was tried).

## Checks

- Mobile type-check, lint, and the `shared`, `auth` and `onboarding` tests
  (826), including the solid-tone contrast check (white on blue-600 passes
  AA in both themes).
- iOS Simulator: the sign-in and domain screens. Onboarding not seen.
