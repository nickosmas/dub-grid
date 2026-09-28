# Fix: Mobile auth text keeps its tracking and its label size

**Type:** Fix
**Status:** verified

## The problem

Found by the owner on 2026-09-27 during the 41d3 iOS rehearsal:

- **Spaced-out field text.** After a code step, the next field read "E m a i l"
  or "N e w password". `AuthField`'s code variant sets `letterSpacing: 10`; a
  stage that reused the same native `TextInput` kept that tracking, because
  iOS does not reset it when the prop is removed and the text variant set none.
- **Tiny button labels.** Sign-in's "Continue", "Sign in" and "Verify and sign
  in" rendered at up to half size. Sign-in keeps one `Button` across its
  stages and changes only its label. `FitText` reset its scale and natural
  width on a new label but kept the previous label's slot width, so a longer
  label was judged against a shorter one's slot and shrank to the floor; a
  full-width button never grows, so nothing undid it. Screens that mount a
  fresh button (forgot password, reset) were unaffected.

## What changed

- `AuthField`'s text variant sets `letterSpacing: 0` explicitly.
- `FitText` remounts its fitting logic, keyed on the label text and font size,
  so every label is measured from scratch; the in-place reset is gone.

## How it was checked

- `FitText.remount.test.tsx`: a new label or font size remounts the fitting
  logic and an unchanged one does not; both tests fail against the previous
  `FitText`. Shared, auth and onboarding suites pass (736).
- The tracking fix is style-only (the test harness drops styles) and rests on
  the simulator check.
