# 38e. Sheet and popup polish

**Type:** Feature

**Status:** verified

**Build plan:** 38e, fifth sub-feature of 38. Depends on 38a.

## Goal

The last three shared surfaces that still carry pre-38a geometry: the
confirmation popup, the keyboard accessory bar and the scrolling tab strip.
Each moves onto the control scale and the single-edge rule so no primitive
is left arguing with the contract.

## Scope

- `ConfirmationModal`: the icon badge becomes fill-only (its 1px stroke was
  the same outline-sticker the hero tiles shed); the footer's bottom padding
  matches the space above the actions (24 both sides) per the popup-footer
  symmetry rule.
- `ScrollableTabStrip`: the pill height and the skeleton's placeholder height
  both read `mobileControl.sm` so the strip and its skeleton cannot drift
  from the scale.
- `KeyboardDoneAccessory`: horizontal padding on the ramp token.

Out: any behaviour change to these components.

## Build steps

- [x] **1. Polish the three primitives**
  - The changes above, in place.
  - Tests: existing ConfirmationModal, ScrollableTabStrip and
    KeyboardDoneAccessory suites stay green; `contrast.test.ts` still holds
    the confirmation icon fills.
  - Done when the mobile suite, `type-check` and lint pass.

## Verify

- `npm run test:mobile`, mobile `type-check`, `npm run lint`.
- Simulator: a confirmation popup's icon circle has no outline and the
  buttons sit centred between the body and the card's bottom edge; the
  Schedule tab strip pills match the Filter button's height.

## Outcome

- Checkpoint `84b3a23b` on `dev` (2026-09-17): `ConfirmationModal`,
  `ScrollableTabStrip`, `KeyboardDoneAccessory`, plus a repair to
  `ProfileWorkScreen` and `AddPersonScreen`.
- The repair: the 38d codemod wrote three `mobileSpace` imports as a
  worktree-absolute path (`../../../../../../../../tmp/dg-.../...`) because
  macOS resolves `/tmp` through `/private/tmp` and the relative-path
  computation compared the two spellings. They resolved only on the machine
  that wrote them. All three now import the normal relative path; a grep for
  `tmp/dg-` across the repo returns nothing.
- Evidence: full mobile suite 140 files / 1136 tests, mobile `type-check` and
  lint clean, repo-wide type-check and tests green in the pre-push hook.
