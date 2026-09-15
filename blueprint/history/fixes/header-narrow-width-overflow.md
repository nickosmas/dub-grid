# Fix header overflow at high zoom / narrow desktop widths

**Type:** Fix
**Status:** verified

## The problem

Two Playwright specs failed in CI (not locally on macOS) because the org
header's row — logo, org name, 5 nav links, trial badge, notification bell,
account menu — has no responsive behavior between the tablet breakpoint
(768-1024px) and a full-width desktop. At 800px (inside the tablet range,
where several compactions already apply) and at 1152px effective width
(1440px desktop at 125% browser zoom, outside the tablet range entirely), the
row's total content still exceeds the viewport and the page overflows
horizontally.

This was previously investigated and deliberately deferred to build-plan item
25 (the broader "Web UI consistency and interaction resilience" epic) rather
than patched, since a text-truncation-only attempt at the account menu had
zero measured effect — the account button's fixed footprint, not its text
length, was the actual constraint, and the real gap is the row having no
fallback at all in this width range.

## The fix

Added a `HEADER_NARROW` breakpoint (`max-width: 1200px`, covering both
observed failure widths) and used it to hide the trial/billing notice badge
entirely — the one header element cheapest to drop — instead of just
compacting it. The badge already had a `compact` mode for the tablet range,
but compacting it wasn't enough; removing it reclaims enough width for the
account menu and nav links to fit without wrapping in both failing scenarios.
No other header element changed.

## Build steps

- [x] **Step 1 - Hide the trial badge below 1200px effective width.** Added
      `HEADER_NARROW` to `useMediaQuery.ts`, wired it into `Header.tsx` to hide
      `HeaderBillingNotice` (both the regular and gridmaster render paths) when
      narrow, and updated `Header.test.tsx`'s `@/hooks` mock to include the new
      export. Done when `settings-layout.spec.ts` and `typography.spec.ts`'s
      "productive typography..." test pass.

## Verification

- `Header.test.tsx` (32/32) and the full web unit suite (433 files / 3699
  tests) pass.
- `npx tsc --noEmit`, `npx turbo run lint`, `npx prettier --check` all clean.
- Full chromium Playwright suite (28/28) passes locally, including both
  previously-failing specs. The failure was CI-Linux-specific (font-metric
  differences), so real confirmation is the next CI run.
