# Fix: No ring icon inside a disc

**Type:** Fix
**Status:** verified
**Branch:** `fix/no-nested-ring-icons`

## The problem

`StatusIcon` (web banners since #300) draws an own icon with no solid form in
white inside a tone-coloured disc. An icon that is already drawn in a ring
(`CircleCheck`, `CircleX`, `Info`, `AlarmClock`) then shows its ring inside
the disc: two circles around a small mark. The owner saw it on the Settings >
Billing seats banner ("this kind of design is a big no", 2026-11-03).

## The fix

Those four icons get solid forms, so each draws as one shape: `CircleCheck`
and `Info` take the success and info tone shapes, `CircleX` a solid circle
with the X cut out, and `AlarmClock` a solid face with its bells and feet as
lines and its hands cut out.

## Build steps

- [x] **1.** Solid forms in `StatusIcon`, with a test that each draws one
      `svg` and that an icon with no solid form still sits in a disc.

## Verify

`StatusIcon.test.tsx` (5 tests), web `type-check`, ESLint and Prettier on the
changed files. The four icons rendered before and after at 56px.
