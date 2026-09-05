# Attributed publish confirmation

**Type:** Fix

**Status:** verified

## The problem

Publishing commits every draft in the window, including other editors' work,
and the confirmation says nothing about whose changes are going live.

`handlePublish` calls `guardUnlockedRange` and then publishes the whole date
range. That guard only sees cells someone currently has a panel open on, so it
is simultaneously too strict and too loose. Too strict, because one colleague
focused on a single cell blocks the entire publish. Too loose, and this is the
real risk, because an editor who made twenty draft changes but is not focused on
any cell right now holds no lock at all, so their unfinished work is published
silently.

The confirmation is a single interpolated sentence: a total count, the window
label, a flat new/edited/deleted summary, and a coverage-gap count. It never
says who made the changes, so a publisher cannot tell their own three edits from
a colleague's twenty half-finished ones.

Notes cannot currently be attributed at all on the client. `schedule_notes`
already stores `updated_by`, but the column is not selected, so the local note
shape has no author and every note is lumped together.

## The fix

Carry `updated_by` through the notes read so notes attribute to an editor the
same way shifts already do through `entry.updatedBy`.

Group the unpublished changes in the publish window by editor and show that
breakdown in the confirmation: each editor with their own new, edited, and
deleted counts for shifts and notes, the current user first and clearly labelled
as themselves. Show the same per-editor detail when the publisher is the only
editor, so the dialog always answers "what exactly am I publishing".

Call out editors who are present on the schedule right now, since their drafts
are the ones most likely to be mid-thought. The publisher still decides: this
warns and attributes, it does not block, and it does not change what publishing
commits. Preserve the existing coverage-gap warning, the cell-lock guard, and
the out-of-window draft notice.

## Build steps

- [x] Carry note authorship through the notes read. Done when the notes query
      selects `updated_by`, the client note shape exposes it, existing note
      rendering and draft counting are unchanged, and a test covers a note
      whose author is missing.
- [x] Group unpublished window changes by editor. Done when a pure helper turns
      the shift map, note map, and publish window into per-editor new, edited,
      and deleted counts for shifts and notes, attributes unknown authors to a
      single clearly labelled group rather than dropping them, orders the
      current user first, totals that match the existing overall breakdown, and
      is covered by tests including an empty window and an unattributed note.
- [x] Show the attributed publish confirmation. Done when the dialog lists each
      editor with their counts, resolves editor names for people who are not
      online, marks editors who are currently on the schedule, keeps the
      coverage-gap warning and the existing publish action, still renders
      correctly when the publisher is the only editor, and degrades to the
      current summary when names cannot be resolved.

## Verify

- Focused tests cover per-editor grouping, unattributed changes, current-user
  ordering, totals matching the overall breakdown, and the dialog rendering
  each editor's counts plus the online marker.
- `rtk npm run type-check`
- `rtk npm run test:web`
- `rtk npm run build`
- Authenticated `/schedule` browser check with drafts from two distinct editors
  proves the confirmation attributes each editor's changes, flags the one who is
  online, and publishes exactly as before.

## Notes

`schedule_notes.updated_by` already exists in the schema, so this needs no
migration. `fetchScheduleActorNames` already resolves user ids to display names
and should be reused rather than adding another lookup. `ConfirmDialog.message`
accepts a `ReactNode`, so the richer body needs no new dialog component.

Deliberately out of scope: changing what publish commits. A scoped
"publish only mine" was considered and set aside, since it needs partial-publish
semantics server-side and is a larger change than making the current behavior
legible.

## Evidence

Recorded 2026-09-03.

| Gate                          | Result                                                         |
| ----------------------------- | -------------------------------------------------------------- |
| `npm run test:web`            | 350 files, 2854 tests, 0 failures                              |
| `npm run type-check`          | clean                                                          |
| `npm run build`               | 11/11 tasks successful                                         |
| `npx eslint` on changed files | 0 errors                                                       |
| Focused suites                | 15 attribution helper tests, 14 dialog tests, 6 note-map tests |

**Not verified in a browser.** The spec's Verify calls for an authenticated
two-editor check of the confirmation. It was attempted and could not be
completed: the local database was reseeded twice by a concurrent session, which
deleted the second QA account and left the organization with no schedule cells,
so there were no drafts to publish. Hand-seeding drafts was rejected because
drafts must go through the snapshot upsert rather than fabricated rows.

The link that check would have proven was verified another way: a
`set_audit_fields` trigger fires BEFORE INSERT OR UPDATE on both
`schedule_cells` and `schedule_notes` and sets `updated_by = auth.uid()`, so
attribution data is populated on every write path rather than only the one a
browser run would have exercised. That trigger only fires when `auth.uid()` is
non-null, which is why the unattributed bucket exists: service-role writes,
including the seed, legitimately leave the column null.

## Scope note

This work shipped alongside the schedule presence and roster fix and a set of
repairs reported during the build (cell locking, draft discarding, publish
gating, presence timing). They share `SchedulePageClient.tsx` and
`useCellLocks.ts`, so they could not be separated into independent commits
without producing intermediate states that do not build.
