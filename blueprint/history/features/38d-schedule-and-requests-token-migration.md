# 38d. Schedule and requests screen token migration

**Type:** Feature

**Status:** verified

**Build plan:** 38d, third sub-feature of 38 to build (order a, b, d, c, e,
f). Depends on 38a's tokens and lint rule.

## Goal

Retire every raw font size and off-ramp spacing literal in the mobile app so
`design/no-raw-mobile-metrics` can become an error and the 38a contract is
enforced rather than advisory. The 38a baseline was 342 warnings in 59 files;
38b brought the dashboard area down, leaving 277 spacing and 46 font-size
sites in 53 files.

## Rounding policy

Recorded here once rather than per file. Spacing literals move to the
nearest `mobileSpace` step, ties resolved toward the ramp's middle:

| Literal    | Token                  | Why                                                           |
| ---------- | ---------------------- | ------------------------------------------------------------- |
| 2, 3       | `xs` (4)               | title-to-caption and pill padding; the row contract says 4    |
| 5, 6, 7    | 5→`xs`, 6→`sm`, 7→`sm` | 6 is the audit's density complaint; it opens up               |
| 9, 10      | 9→`sm`, 10→`md`        | 10 was the app's de-facto row gap; `md` is the ramp's row gap |
| 13, 14     | `md` (12)              | 14 lives on control padding; 12 keeps the 44pt heights intact |
| 18         | `lg` (16)              | card and hero insets; 16 is the card padding                  |
| 22         | `2xl` (24)             |                                                               |
| 28, 36     | `3xl` (32), `4xl` (40) | large gaps round up                                           |
| 42         | `4xl` (40)             |                                                               |
| -18        | `-mobileSpace.lg`      |                                                               |
| 1, 72, -25 | by hand                | optical nudges and one oversize offset                        |

Font sizes map to the variant whose role matches, not merely the nearest
size: 9 and 11 → `badge`, 12 → `label` or `caption` by weight, 13 → `meta`,
14 → `body`/`bodyStrong`, 15 → `rowTitle`, 16 → `sectionTitle`/`cardTitle`,
17 → `cardTitle`, 18 and 20 → `title`, 24 → `heroMetric`, 26-30 →
`display`. Where a site carries its own `lineHeight` or family, the spread
`...mobileText.<variant>` replaces all three so size and line height move
together; a weight override goes through `mobileTextWeighted`.

## Build steps

- [x] **1. Spacing codemod**
  - A one-off script reads the rule's JSON report and rewrites each flagged
    spacing literal to its token per the table, adding the `mobileSpace`
    import where a file lacks it; the by-hand values are resolved after.
  - Done when no `offRampSpacing` warning remains and `type-check` passes.

- [x] **2. Font sizes by hand**
  - Each of the 46 sites moves to a `mobileText` variant (or
    `mobileTextWeighted`), with `lineHeight`/`fontFamily` overrides removed
    where the variant supplies them.
  - Done when no `rawFontSize` warning remains.

- [x] **3. Flip the rule to error and verify**
  - `eslint.config.mjs`: `design/no-raw-mobile-metrics` → `error`;
    `apps/mobile/AGENTS.md` loses the "warning until 38d" caveat.
  - Done when `npm run lint` passes with zero errors, the full mobile suite
    and `type-check` pass.

## Verify

- `npm run lint` (0 errors), `npm run test:mobile`, mobile `type-check`.
- Simulator: Schedule (Home and Team), shift detail, Requests and Profile
  screens still lay out; nothing overlaps or clips at default and large
  text scale.

## Outcome

- Checkpoint `6e23cce7` on `dev` (2026-09-17), 58 files across
  `apps/mobile/src`, `apps/mobile/app`, the design tokens (new `input` type
  step), the lint rule (1pt nudges allowed, now `error`) and its test, and
  `apps/mobile/AGENTS.md`.
- The codemod (`spacing-codemod.py`, scratch, not committed) rewrote 269 of
  the 277 spacing sites from the rule's JSON report; the 8 by-hand sites were
  five 1pt optical nudges (now allowed), two badge paddings (to `xs`), the
  AuthShell top clearance (`5xl + 2xl`) and the schedule timeline dot offset
  (token arithmetic with named rail and dot sizes). All 46 font sizes moved to
  `mobileText` variants or `mobileTextWeighted`.
- Evidence: `design/no-raw-mobile-metrics` 0 findings with the rule at
  `error`; `npm run lint` 0 errors (5 pre-existing web warnings); `lint:rules`
  8/8; full mobile suite 139 files / 1133 tests; mobile `type-check` clean;
  repo-wide type-check and tests green in the pre-push hook.
- Not verified on device: the visual effect of the rounding policy across
  Schedule, shift detail, Requests and Profile. 38f's matrix covers it.
