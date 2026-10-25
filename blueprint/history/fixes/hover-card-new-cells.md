# Grid hover card for a newly added cell

**Type:** Fix
**Status:** verified

## The problem

- After new items stopped showing Before and After, the grid hover card for a single shift or absence added to an empty day drew a change section with nothing in it. The badge's "Added ..." line, which would have explained it, is hidden whenever the card has a change to show.
- On a draft, that section also read "Not published yet. Staff still see the published shift." although nothing was published for the day.

## The fix

- A single new item in the hover card reads "Added: ..." (the chip tooltip text) instead of the empty Was block. Two or more new items keep the "New" card.
- A new draft reads "Not published yet. Staff don't see it until it's published."; a changed draft keeps the old line.

## Verify

- `ScheduleGrid.test.tsx`: a new draft cell's hover card shows the new draft line and "Added: ...", and neither "Staff still see the published shift" nor Before. It fails on the old grid.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web` (6,296 passed). The 6 failures in `worked-cell-rest-of-day-absence.integration.test.ts` come from migration 092 on the shared local database, which another session applied for 50b and which is not on `dev`.
- Browser (local stack, Calm Haven): adding Office to Nancy Thornton's empty Tue 27 as a draft, the hover card read "Not published yet. Staff don't see it until it's published." then "Added: Office". The draft was removed after and the cell confirmed empty.
