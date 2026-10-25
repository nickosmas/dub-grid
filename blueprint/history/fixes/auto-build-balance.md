# Auto-build balance: a requirement's maximum, people left unscheduled, over in one shift and short in another

**Type:** Fix
**Status:** verified

## The problem

Three Auto-build complaints from the owner:

- **A. No way to stop at one.** A shift that needs one Supervisor could be given a second, because the top-up that tops people up to five days only ranked shifts by how short they were, then by how few people they had, so once every shift was met a one-person shift was as good a place as any for an extra day.
- **B. People left with empty days while shifts were short.** The main pass placed people greedily, one gap at a time. Someone it placed early could be the only person able to fill a later gap, which then stayed short while others who could have taken the first shift sat at fewer than five days.
- **C. Over in one shift, short in another.** The same greedy order left one shift over and another short when moving one of the build's own placements would have met both.

## The fix

- **A:** each coverage requirement may set **Maximum Staff** (migration 096, `coverage_requirements.max_staff`, null when unset, at least 1 and never below the minimum). Settings > Coverage offers it behind a "Set a maximum" checkbox once something is required; it starts at the minimum, follows the minimum up, and reads "Max N" in the row. The engine never takes a suggestion or a top-up past a maximum, and a shift's count stays editable by hand. The top-up now ranks by how much an extra person adds for the shift's size, so a one-person shift is the last to get a second even without a maximum. The Schedule Builder's requirement line reads "needs 1, max 1".
- **B and C:** after the main pass the planner rebalances its own placements: for each shift still short it tries moving a person it placed elsewhere (same focus area, qualified, free once their placed shift is gone, within a week) and, when the move alone would open a gap, backfills the shift they leave with the fairest free person. A move is kept only when the measured coverage says it fixes a gap without opening another. Recurring fills and the draft as it stood are never moved (owner's choice, "Only shifts it adds"). The build report names a moved person "Only one who could fill it".

## Verify

- Unit: `coverage-suggestions.test.ts` ("a requirement's most staff in a build", "a build moving its own shifts to a gap"; four of the new tests fail on the old engine), `coverage.test.ts`, `coverage-check-text.test.ts`, the config route (stores `max_staff`, refuses a maximum below the minimum, null when omitted) and the Coverage settings tests (the maximum starts at and follows the minimum; it is not offered until something is required).
- Browser (local stack, Calm Haven, Skilled Nursing, Nov 8 to 14): with a temporary Supervisor requirement of 1, maximum 1, Auto-build gave 133 changes to 19 people and Supervisor stayed 1/1 every day, though 7 people were qualified for it. Undo left no draft cells, and the temporary requirements were deleted.
- Docs: `docs/configuration/coverage-requirements.mdx` (Maximum) and `docs/features/coverage-and-open-shifts.mdx` (rebalancing, top-up order, report reason); inventory and fingerprints re-recorded.

## Release

Migration 096 must reach production before this code does, since the settings and schedule reads select `max_staff`. It follows 095 (overnight request overlaps), which ships first.
