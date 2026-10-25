# Requests read an overnight shift by its real times

**Type:** Fix
**Status:** verified

## The problem

094 made a cell's own shifts overlap by real times, so Early 6 AM - 2 PM beside Night 11 PM - 7 AM is a valid double. Requests still folded the night's morning onto the day it starts:

- **Shift against shift.** A pickup, claim, volunteer or swap that put Early and Night on one person's same day was refused as overlapping, in the database (`work_assignment_times_overlap`) and in the apps (`timesOverlap` in schedule-core and its copy in `schedule-logic.ts`), which drive staffing, Builder suggestions, the panel's swap check and the mobile request lists.
- **Arrived late against a shift.** Someone who arrived late to Early (absent 6 AM - 8 AM) was refused that night's shift "during that shift" (`rest_of_day_absence_conflict`, and `absenceBlocksWork` with its day offsets).

Found during the shift editor edge-case sweep and left for the session that owned absences; fixed here with that session's agreement (2026-10-25).

## The fix

- Migration 095 restates `work_assignment_times_overlap`: minutes from that date's midnight, an overnight end on the next day. Every caller compares one date; the next-day clash stays the adjacent-day check's job.
- 095 restates `rest_of_day_absence_conflict` with its arrived-late branch compared the same way. An arrived-late absence starts at the work's scheduled start on that date, so it runs forward from the same midnight, including 11 PM - 1 AM beside a night shift.
- `timesOverlap` (both copies) uses the same rule through `sameDayRangesOverlap`; `absenceBlocksWork` drops its previous-day and next-day offsets.
- `absence_times_overlap_work` (092) keeps folding by clock on purpose: it also checks an absence against its own cell at save, where a left-early absence on a night shift really is on the next day.
- The shift requests page says a night shift doesn't overlap an early shift on the same day.

## Verify

- Unit: `dates.test.ts`, `schedule-logic.test.ts` and `absence-side.test.ts`; each new case fails on the old code. One old `absence-side` case expected the fold (Night 11 PM - 7:30 AM clashing with a 7 AM - 11 AM late arrival) and now expects no clash.
- Live database: `overnight-request-overlaps.integration.test.ts` checks Early against Night, a real evening overlap, an arrived-late Early taking that night's shift, and a late arrival to a night shift read from that evening. The first two fail against the old function bodies.
- Migration 095 was numbered with the Coverage panel session, whose `coverage_max_staff` moved to 096.
