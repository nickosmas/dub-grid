# Fix: A schedule note shows only in its shift's own focus area

**Type:** Fix
**Status:** verified

## The problem

`note-dots-and-attribution` made each pill of a double shift look up its notes under its shift's own focus area. A person listed in two focus areas therefore showed a note on a pill drawn in the other area's section too. The owner's rule (2026-09-28): a note shows only in the focus area of its shift. Single shifts already behaved that way, because the grid looks up a cell's notes under the section's focus area.

## The fix

- Each pill of a double shift looks up its notes under the section's focus area, still filtered to its own shift. A pill whose shift belongs to another area finds none there, and shows its note in its own area's section.
- Single shifts are unchanged.

## Verify

- `npm run type-check` passes; the schedule, grid, Month, Day and print tests pass (297).
- New grid test: a double shift whose second pill belongs to another focus area shows no note on that pill in the first section, and the note shows in its own area's section. It fails against the previous lookup.
- No browser check: the local database had no active person with a double shift across two focus areas, and creating one would have written over other sessions' test data.
