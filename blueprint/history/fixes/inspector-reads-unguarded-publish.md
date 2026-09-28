# Fix: The migration inspector reads 075's unguarded publish body

**Type:** Fix
**Status:** verified

## The problem

Migration 075 renames `publish_schedule` to `publish_schedule_unguarded` and
puts a thin wrapper in its place. The inspector's
`publish_schedule_split_times` invariant searched the wrapper's text for 020's
`split_part` repair, so after 075 it reported "casts delimited times to TIME"
against production (2026-09-28, right after the owner applied 075) although
the repair was intact in the unguarded body.

## The fix

The invariant reads `publish_schedule_unguarded` when it exists and falls back
to `publish_schedule` otherwise, so a database before 075 is judged exactly as
before.

## Build steps

- [x] **Step 1 - read the unguarded body** - _Done 2026-09-28:_ the inspector
      passes the check against the local stack (075 applied) and against
      production (`--expect-complete`: 75 entries, none missing, every
      invariant passing, health 200).

Release: migration 075 applied to production 2026-09-28 by the owner from
`8ada0035` (latest backup 2026-09-28 13:41:39 UTC). Before: 74 ledger entries,
only 075 missing. After: 75 entries, none missing, health 200; every invariant
passes with this fix.
