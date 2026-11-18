# Fix: iPhone Duo - top rows line up with the camera

**Type:** Fix
**Status:** verified
**Branch:** `fix/duo-top-row-camera`

### The problem

On iPhone Duo, closed or open, the status bar stands in the side column, so
the top safe-area inset is 0. The rows DubGrid draws itself at the top of a
screen then sit at the very top: the sign-in wordmark centres at 30.5 pt while
the camera beside it centres at 47.7 pt (measured on the simulator,
2026-11-17), and the owner asked for the logo to line up with the camera.
Home's and Schedule's sticky header (title, week arrows, alerts bell) and
onboarding's logo and Skip row sit the same way. Native navigation bars (the
People large title) already centre on the camera.

### The fix

One tested helper in `screen-layout.ts` gives the extra top room when the top
inset is 0 and a side inset is set: enough to move a top row centred at 30 pt
(8 pt above a 44 pt row) to the camera's centre. Use it in `AuthShell`'s
brand row, onboarding's header row and `Screen`'s sticky header. The two logo
rows centre the lockup's optical centre (the middle of the word's lowercase
height, measured from the lockup's own box with `onLayout`) rather than
assuming a 44 pt row, since onboarding's Skip makes its row taller.

Measured after the fix on the closed Duo: camera 47.7, sign-in and onboarding
lowercase centre 48.2, Home's arrows and bell about 48. With a top
inset (every other iPhone, the Duo held tall) it adds nothing.

### Build steps

- [x] **1. Top rows meet the camera.** The helper with its test, used in the
      three rows.
      **Done when:** on the closed Duo the sign-in wordmark, the onboarding
      logo and Home's header row centre within a point of the camera; held
      tall and on a regular iPhone they don't move.

### Verify

- `npm run test:mobile`, `npm run type-check`, eslint on the changed files.
- iPhone Duo simulator: sign-in, onboarding and Home closed and open, measured
  against the camera; held tall unchanged.
