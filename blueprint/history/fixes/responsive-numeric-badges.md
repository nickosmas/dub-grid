# Responsive numeric badges

**Type:** Fix
**Status:** verified

## The problem

Dynamic counts were sometimes rendered in fixed square circles. Two-digit
values lost comfortable inner spacing, while three-digit values could collide
with or escape the circle instead of widening with their content. The
open-shift `needed` count in the schedule grid was the visible example.

## The fix

Dynamic numeric badges now share an intrinsic sizing rule: short values retain
a padded circle and longer values widen into a fully rounded pill. The rule is
used by the schedule count, alert count, and matching product preview.
Decorative dots, avatars, dates, and fixed step markers remain unchanged. Mobile
dynamic count badges already followed the equivalent minimum-width-plus-padding
rule and required no rewrite.

## Build steps

- [x] **Step 1 - Standardize dynamic numeric badge sizing** - added the shared
      web primitive and replaced fixed-size dynamic count circles in the
      schedule and alert surfaces, including the matching landing preview.

## Verification

- Representative `8`, `98`, `100`, and `999+` component cases pass: the first
  two remain circles and the latter two render as pills.
- The complete web suite passed: 433 files and 3,691 tests, followed by the web
  type-check.
- The exact final candidate passed `npm run test`, `npm run type-check`,
  `npm run lint`, `npm run format:check`, and `npm run build`.
- Manual try path: open Calm Haven Schedule with an open-shift count; confirm
  one- and two-digit values have balanced padding and a three-digit value grows
  horizontally without clipping at normal and narrow widths.
