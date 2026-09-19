# Feature: Fix the inert publish-highlight controls

**From build-plan:** features 27 and 31 (one defect, one fix)

**Status:** verified

## Goal

Two build-plan items describe the same bug from different angles, and the
plan already suspected as much ("same bug family as item 27"):

- **27** - after publishing, the show-highlights button in the publish
  banner "stops responding" until the banner is closed and highlights are
  reopened from the toolbar. The plan guessed at stale state.
- **31** - `showPublishDiff`/`publishDiffForKey` are threaded only into the
  desktop `ScheduleGrid`; `MonthView` and `MobileDayView` accept no
  publish-diff props, so the toggle flips state with no visible effect.

Item 31 is confirmed by inspection: neither `MonthView.tsx` nor
`MobileDayView.tsx` mentions publish diffs at all.

Item 27 was **reproduced in the browser**, and the plan's stale-state guess
turned out to be wrong. The banner's button already uses a functional
update (`setShowPublishDiff(v => !v)`), so it has no stale closure. What
actually happens is that the control is offered when it has nothing to
paint. Rolling the viewer's `schedule_last_viewed_at` back to surface the
seeded publish banner, then clicking the toggle:

|                   | before fix                                                          | after fix                                      |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| banner            | `Published 17 hr ago \| Highlight Changes \| View History \| Close` | `Published 17 hr ago \| View History \| Close` |
| toggle present    | yes                                                                 | no                                             |
| label on click    | flips to "Hide Changes"                                             | n/a                                            |
| tinted grid cells | 65 -> 65 (nothing happens)                                          | n/a                                            |

The state flips and the label changes, so the button looks alive while the
grid never moves - exactly "stops responding".

So there are two ways the control can be inert, and both were unguarded:

1. **The active view cannot render the overlay** (month view, mobile day
   view) - item 31.
2. **The publish has no changes to paint** in the current window - what
   reproduced above.

## The fix

One guard in `SchedulePageClient.tsx` covering both:

- `publishDiffRenderable` - true only for the desktop week/2-week grid,
  the one view that takes the publish-diff props.
- `publishChangeTotal` - the counts the banner already computes for its
  chips.
- `canHighlightPublishChanges` = renderable **and** something to show; the
  banner renders the toggle only then, in both the staff and the
  scheduler branch.
- When the changes exist but the view cannot paint them, the banner says
  "Switch to week view to highlight changes" instead of offering a dead
  button - mirroring the existing "Use a larger screen to view details"
  copy on mobile.
- An effect turns the overlay off when the view stops being able to render
  it, so switching to month view cannot strand it on with its only off
  switch hidden.

This follows the project's own standing UI rule - never a no-op control -
and takes the plan's second sanctioned option for item 31 ("hide the toggle
when the active view can't render it") rather than threading a
publish-diff visual into two more views, which would be a feature-sized
change with its own design decisions.

## Verification

Both directions exercised in a real browser against the dev server:

- **nothing to highlight** (seeded publish, 0 change rows): banner renders,
  toggle absent.
- **something to highlight** (6 synthetic `schedule_publish_changes` rows
  inserted for that publish): banner shows the "6 deleted" chip, the
  toggle returns, and clicking it takes the grid from 65 to **77** tinted
  cells - the overlay paints.

The synthetic rows were deleted and `schedule_last_viewed_at` restored
afterwards; `schedule_publish_changes` is back to 0 rows.

`tsc --noEmit` clean, eslint clean, prettier clean, and the schedule and
role-variance e2e specs green.

## Files / areas

- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` - the guard,
  the explanatory copy, and the overlay-off effect

## Notes

Incidental finding, recorded here rather than acted on: the seed writes
`publish_history` rows with no `schedule_publish_changes` rows at all, so
a freshly seeded database can never demonstrate the highlight overlay.
Worth seeding a few change rows if that flow is ever demoed or tested.
