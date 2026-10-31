# Fix: Toasts are quiet neutral cards in the bottom right

**Type:** Fix
**Status:** verified
**Branch:** `fix/toast-redesign`

## The problem

Web toasts (Sonner 2, `apps/web/src/components/AppToaster.tsx`, styled by the
"Toast Overrides (Sonner)" block in `apps/web/src/app/globals.css`) are solid
green, red, blue or amber banners, up to 720px wide at the top center, with a
white close pill, and every one stays 6 seconds. Errors fire about twice as
often as successes (296 `toast.error` calls to 151 `toast.success`), so a loud
red bar keeps covering the top of the schedule. Short confirmations stay too
long, and errors with a detail line or an action go before they can be read.

## The fix

The owner settled the design on 2026-10-31 over five rounds of inline
prototypes: every type is the same neutral card, and only the icon carries
the tone. Web only; the mobile app's toasts are unchanged.

**Look**

- Bottom right, 400px wide (`min(400px, 100vw - 32px)` on narrow screens).
- Card: `--dg-color-surface`, 1px `--dg-color-border`, a soft shadow, radius
  14px (`--dg-radius-2xl`), padding 16px top, bottom and left, 8px right, 12px between columns.
- Title 14px / 20px line, semibold, `--dg-color-text-primary`. Detail 13px /
  18px, regular, `--dg-color-text-muted`, 2px below the title and starting on
  the title's column.
- Icon: Lucide at 20px, stroke 2, centered on the title's first 20px line:
  `CircleCheck` (success), `CircleAlert` (error), `TriangleAlert` (warning),
  `Info` (info), a spinning `LoaderCircle` (loading). Colors from the existing
  semantic tokens for success, danger, warning and info. Passed through
  Sonner's `icons` prop.
- Action and close are matched 28px ghost buttons on that same first line,
  2px apart, radius 8px, sharing one hover fill (`--dg-color-surface-hover`
  or the nearest existing hover token). The action label is 14px semibold in
  `--dg-color-brand`. The close glyph is a 20px Lucide `X`, so the cross is
  10px tall, the Undo label's cap height; in `--dg-color-text-subtle`,
  `--dg-color-text-primary` on hover. The close button follows the action
  (flex `order`), not Sonner's default top-left badge, and its right padding
  puts the cross 18px from the card's edge, matching the icon on the left.
- Dark mode reads every color from the same tokens; no separate hex.
- The toaster inherits Inter; Sonner otherwise sets its own system font stack.
- Remove the `--dg-toast-*` tokens. Keep the `--dg-on-dark-*` tokens, which
  `app-ui.css` also uses.

**Timing**

- By type, unless the caller passes a `duration`: success 4s, info 5s,
  warning 7s, error 8s, and any toast with an action at least 8s. Loading
  stays until resolved, as Sonner does. Explicit durations (`Infinity` in
  `lib/error-handling.ts` and `RunLogoutTeardown`, 6000 and 8000 elsewhere)
  are kept.
- Errors close on their timer.
- Collapsed stack (Sonner's default `expand={false}`) that fans out on hover,
  `visibleToasts={3}`; hovering pauses every timer, and queued toasts don't
  count down.
- No time bar.
- The existing dedupe in `AppToaster` stays: the same tone, title and
  description replaces the earlier toast.

**Must not break**

- Every `toast.*` call site keeps working unchanged; no copy changes.
- The dedupe patch and callers that pass their own `id`.
- `neutral-control-chrome.test.ts` asserts `AppToaster` uses a radius token
  (`rounded-[var(--dg-radius-lg)]`). The approved 14px radius gets its own
  token, `--dg-radius-2xl: 14px`, beside `--dg-radius-xl` in `globals.css`,
  and the assertion moves to it (owner, 2026-10-31).

## Build steps

- [x] **1. Timing.** Put the per-type defaults and the action floor in one
      shared helper (`@dubgrid/design-tokens`, which the mobile toast spec,
      `parked/mobile-toast-native.md`, reuses; whichever lands first creates it),
      and apply it in `AppToaster.tsx`'s existing tone patch, the caller's
      `duration` winning. Set
      `position="bottom-right"`, `visibleToasts={3}`, and drop the global
      `duration`. Unit test next to it: each tone's default, the action floor, an
      explicit duration and `Infinity` passing through, and `loading` left alone.
      **Done when:** the test passes and `npm run type-check` is clean.

- [x] **2. Look.** Pass the Lucide icons through `icons`, replace the Toast
      Overrides block in `globals.css` with the card above (order the action and
      close buttons, align them to the first line), remove the `--dg-toast-*`
      tokens, add `--dg-radius-2xl: 14px` for the card's radius, and point the
      chrome test's radius assertion at it.
      **Done when:** `npm run lint`, `npm run type-check` and `npm run test:web`
      pass, and the browser check under Verify matches.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`.
- In the browser, as `qa-super-admin@dubgrid.test`, in light and dark, at
  desktop width and 390px:
  - Save something (Settings > Certifications): a one-line success card in
    the bottom right with a green check, gone after about 4s.
  - Remove an absence run in the grid: the Undo toast shows Undo and the X as
    one row of equal-height buttons on the title's line, and stays at least 8s.
  - Trigger a validation or save error: a neutral card with a red icon, the
    detail line under the title, gone after 8s.
  - Fire several quickly: three show stacked behind the newest; hovering fans
    them out and pauses them.
  - With the alignment guides from the prototype in mind, the icon, title,
    action and X share one centerline, and the icon and cross sit the same
    distance from their edges.
  - Screenshots of each go to the owner.

## Out of scope

- Mobile toasts and banners.
- Changing any toast's wording, or which calls use toasts.
- Tinted or filled toasts by type (considered and declined, 2026-10-31).

## Outcome

Completed 2026-10-31 on `fix/toast-redesign`.

- **Timing:** `resolveToastDuration` in `@dubgrid/design-tokens` holds the
  per-type defaults and the action floor; the web's `withToastDuration` applies
  them unless the caller set a duration, since web says Infinity and mobile null
  for a toast that stays. Measured in the browser with no duration given:
  success 4.1s, info 5.1s, warning 7.1s, error 8.1s, a success with Undo 8.1s,
  and an error with `duration: 3000` 3.1s.
- **Look:** checked as `qa-super-admin@dubgrid.test` in light and dark, at
  1280 and 390 wide. Icon, title, Undo and X share one centerline (27px from
  the card's top); Undo and X sit 2px apart; the icon box is 17px from the left
  edge and the X glyph 13px from the right, so the circle and the cross both
  sit about 18px in. At 390 the card is 358 wide with 16px gutters and the page
  does not scroll sideways.
- **Stack:** three visible, collapsed until hovered; hovering pauses them.
- **Found while building:** Sonner sets its own system font stack on the
  toaster, so the old toasts were never in Inter either; the toaster now
  inherits it.
- **Checks:** `npm run type-check`, `npm run lint` (no errors), `npm run
test:web` (742 files, 7,102 tests) and the design-tokens tests (102) pass.
  `npm run build` cannot run from a worktree (Turbopack cannot follow the
  symlinked `node_modules`); the release PR's CI build is the gate.
- **Not exercised:** toasts were fired from the app's own patched `toast` in
  the browser console rather than through Settings > Certifications or the
  absence Undo.
- **Next:** the mobile toasts (`blueprint/context/parked/mobile-toast-native.md`)
  reuse the timing helper.
