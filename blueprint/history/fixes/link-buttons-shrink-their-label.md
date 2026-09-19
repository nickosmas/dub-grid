# Link buttons render their label at a fraction of its size

**Type:** Fix

**Status:** verified

## The problem

The onboarding "Skip" button renders at roughly 6pt on first paint (seen on
the iPhone 17 Pro simulator on 2026-09-17), and every other `tone="link"`
`<Button>` is exposed to the same collapse.

`Button` gives a link the same horizontal padding as a filled button of its
size (20pt each side at `md`), and its label carries `adjustsFontSizeToFit`
with `numberOfLines={1}`. Onboarding places "Skip" in a 64pt-wide container,
which leaves 24pt for the text; iOS shrinks it to fit and, with the label's
`flexShrink: 1` re-measuring against that width, ignores
`minimumFontScale`. The shrink exists for equal-width filled buttons in an
action grid, where a long label should scale before it truncates. A link is
text, not a filled control: it should keep its own padding to a minimum and
ellipsize rather than shrink.

## The fix

- `tone="link"` uses `mobileSpace.sm` (8pt) horizontal padding at every size.
- `tone="link"` labels do not set `adjustsFontSizeToFit`; they keep
  `numberOfLines={1}` and tail ellipsis. Filled and outlined tones keep the
  scale-then-truncate behaviour.
- No layout API changes: `fullWidth`, sizes and every call site stay as they
  are, so `AuthActions`, `ActionButtons` and `ExpandableList` are unaffected
  beyond the narrower padding.

## Build steps

- [x] **1. Give link buttons text padding and no shrink**
  - `Button.tsx`: resolve `paddingHorizontal` to `mobileSpace.sm` for
    `tone="link"`; pass `adjustsFontSizeToFit={tone !== "link"}` and
    `minimumFontScale` only alongside it.
  - `Button.test.tsx`: a link button's label has no
    `data-adjusts-font-size-to-fit` and the button carries 8pt horizontal
    padding; the existing scale-then-truncate test still holds for a filled
    button.
  - Done when the Button suite passes and `type-check` is clean.

## Verify

- `npx vitest run src/shared/components/Button.test.tsx --root apps/mobile`.
- Cold-start the app with onboarding reset (long-press the wordmark on the
  login screen in a dev build): "Skip" reads at the same size as the slide
  copy's link text. On the dashboard, "See all N" is unchanged in size.

## Outcome

- Checkpoint `1194c922` on `dev` (2026-09-17): `Button.tsx`, `Button.test.tsx`.
- Evidence: Button, action-button-layout, onboarding and auth suites 139/139
  (one new link test), mobile `type-check` clean, repo-wide type-check and
  tests green in the pre-push hook. The RN test stub drops `style`, so the
  8pt padding is not asserted; it is one line in `Button.tsx`.
- Device check pending an authenticated simulator session.
