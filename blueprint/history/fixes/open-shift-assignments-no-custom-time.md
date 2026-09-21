# Open-shift assignments must not carry a custom time

**Type:** Fix

**Status:** verified

## The problem

A cell shows "Custom time" whenever `custom_start_time` and `custom_end_time`
are set; nothing compared them with the segment's own default. Two web flows
wrote the resolved default into those fields, so every open-shift assignment
looked deliberately retimed:

- Scheduler staffing (`open-shift-staffing.ts`): the option's resolved times,
  needed for the conflict checks, were also persisted as custom.
- Coverage-gap volunteering (`SchedulePageClient.tsx`): the gap's
  `GridOpenShift` and the claim handlers sent the assignment default as custom,
  and approval copied it verbatim into the published cell.

Every other path (request approval, swaps, moves, paste, series, recurring,
import, publish, mobile volunteering) only copies existing custom times.

## The fix

- Options carry `alignedCustomTimeRanges` (the calloff's own custom times,
  null otherwise); `buildStaffedOpenShiftInput` persists only those.
  `alignedTimeRanges` keeps resolving defaults for the overlap checks.
- Coverage-gap open shifts and the volunteer payloads carry `null` custom
  times; `getOpenShiftTimeRanges` already falls back to defaults for the
  started and conflict checks.
- Migration `027`: `normalize_schedule_custom_times` blanks a per-segment
  slot only when both ends equal the default resolved by
  `resolve_work_assignment_time_ranges`; `sync_schedule_cell_snapshot`, the
  single snapshot insert site, applies it to every worked write; an
  idempotent UPDATE repairs draft and published rows already stored that way.

## Build steps

- [x] **1. Staffing writes only explicit custom times** - `alignedCustomTimeRanges`
      on `OpenShiftStaffingOption`; tests flip the pinned default-as-custom
      expectation and add calloff-preserve and gap-null cases.
- [x] **2. Coverage-gap volunteering sends null custom times** - the gap
      `GridOpenShift`, the single-eligible claim, and the multi-choice confirm.
- [x] **3. Server guard and data repair** - migration `027`, checksum lock,
      `schedule-custom-time-sql.test.ts` contract test, CHANGELOG and doc notes.

## Verify

- Unit: `open-shift-staffing.test.ts` (14), `OpenShiftStaffingModal.test.tsx`,
  `schedule-custom-time-sql.test.ts` (3); full web suite 460 files / 3997
  tests green; web type-check, lint, Prettier, `db:migrations:check` (027
  listed), production build.
- Migration dry run (rolled back) on the local seed: equal-to-default slot
  nulled, a differing end kept, a second-slot default blanked to `16:00|`,
  garbage left alone; a corrupted row repaired on the first UPDATE, 0 rows on
  the second.
- Live, Calm Haven on the worktree dev server: super admin staffed a coverage
  gap (draft cell: existing segment kept, custom NULL); `qa-regular`
  volunteered for a gap (request state custom NULL) and the super admin's
  approval published the cell with custom NULL; `upsertShift` with the default
  as custom stored NULL, with `15:30-21:30` stored as sent.

**Completed:** 2026-09-21 in commit `5cc67a3e` (archived after the fact by the next fix).
