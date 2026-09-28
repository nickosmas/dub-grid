# Fix: The Month view's other-area note merge reads only the person's areas and lands on a visible row

**Type:** Fix
**Status:** verified
**Fixes:** F-106

## The problem

F-82's merge (`components/MonthView.tsx`) adds notes filed under a focus area the person has no row in that day, or under none, to their first row. Three gaps:

1. It walks every focus area in the organization, not the person's own, so each person costs `(areas + 1)` lookups per day across the grid on every notes change.
2. With a focus-area filter, the first row can sit in a filtered-out section, so the merged notes never show.
3. It deduplicates on type and state, so one note type filed `published` in one area and `draft_added` in another shows two marks.

The tests did not cover the no-area note, the filter or the dedup.

## The fix

- Walk `emp.focusAreaIds` (looked up once per render) plus no area, skipping areas where the person already has a row.
- Merge onto the person's first row that the active focus-area filter leaves visible. With no visible row there is nothing to show, so nothing is merged.
- Deduplicate on the note type; the row's own marks come first.
- Four tests: a no-area note, the person's own areas only, the filter, and one mark per type. The last three fail against the previous code.

## Build steps

1. **Merge and tests** - as above.
   - Done when: `MonthView.test.tsx` passes (7).

## Verify

- `npx vitest run src/__tests__/MonthView.test.tsx` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Evidence

- `MonthView.test.tsx` (7) passes; the own-areas, filter and one-mark-per-type cases fail against the previous `MonthView.tsx`.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,295), `npm run test:mobile` (1,401) and the live suite (37 files, 176 tests) pass.
- No browser check: the change is confined to the popover's row data, which the component tests render.
