# Fix: Home's wash is more vibrant, and the hero's glow no longer ends in a line

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-home-wash-polish`

## The problem

With Home's wash back (#334), the owner saw a hard horizontal edge above the
hero card, and asked for the wash to be a little more vibrant (2026-11-04).

The hero's blue glow (28 blur, 14 down) reached past the 24-point gap under
the header, and the top of the scrolling area cut it in a straight line across
the wash.

## The fix

- The hero's glow is 20 blur and 16 down, so it sits below the card and fades
  out inside the gap.
- Home's wash runs about 1.6 times stronger: 0.22 / 0.08 at the top in light,
  0.34 / 0.13 in dark, from the brand blue or the coverage hue. Both Homes
  build it with `buildCoverageWash`; the staff Home takes the blue. The
  sign-in and onboarding aurora keep the shared token's strength.

## Evidence

- Mobile: all 1,596 tests pass, type-check and lint clean; the wash tests carry
  the new alphas.
- iOS Simulator, with a temporary sample shift so the hero shows: a zoom above
  the hero before (a line) and after (none), and the page in light and dark.
- Not checked on Android or a physical phone.
