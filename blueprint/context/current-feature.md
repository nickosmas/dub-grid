# Current Feature

**Title:** Show mobile shift changes and previous values

**Type:** Fix

**Status:** verified

## The problem

Mobile schedule entries contain only the effective shift presentation and publication
metadata. When an unpublished change exists, the mobile app cannot say whether the
shift is new, edited, or deleted, and it has no published values to show as the
previous shift. This affects schedule cards, the featured home hero, and shift
details.

## The fix

Expose a small, typed change-history payload from the mobile schedule API by comparing
the effective and published snapshots. Use the existing web `new`, `modified`, and
`deleted` semantics. Show compact `New`, `Edit`, or `Del` labels where shifts are
dense, keep the approved compact card and hero presentation, and make the full prior
shift available from shift details. Do not use a briefcase icon.

**Design reference:**
`/Users/nickosmas/.codex/visualizations/2026/09/05/01a0736c-b108-7dd0-b238-76c6ce7a3a0a/mobile-shift-change-prototypes.html`

## Build steps

- [x] **1. Add typed mobile change history.** Extend the mobile schedule contract
      and server assembly to return a change kind plus the prior published shift
      presentation when a draft differs from its published baseline. Preserve
      unchanged published entries and distinguish `new`, `modified`, and `deleted`.
      Done when API and contract tests prove each kind and its prior values.

- [x] **2. Show changes in mobile schedule and home hero cards.** Add the compact
      status label and a quiet previous-value row to changed schedule cards and the
      featured home hero, following the existing card and gradient language. Keep
      unchanged cards unchanged, use no briefcase icon, and retain navigation to the
      normal shift detail screen. Correct focus-area treatment in every card and hero
      variation: absence types show no focus area, general shifts show no focus area,
      standard shifts show their focus area, and multi-shift or mixed general/standard
      combinations only show focus areas attached to their qualifying regular segments.
      Done when card and hero tests cover visible labels, prior-value content, and all
      focus-area display variants.

- [x] **3. Add prior-shift details.** In the existing shift-detail presentation,
      expose changed fields and a `View previous shift` row that opens a
      `BottomSheetModal` with the prior shift name, time, and focus area. Handle
      new and deleted shifts without inventing previous values.
      Done when shift-detail tests cover the sheet, self and teammate shifts, and
      accessible labels.

- [x] **4. Keep mobile focus-area tabs faithful to each shift.** Resolve the focus
      area from the assigned regular shift before any legacy schedule-cell value,
      so a multi-focus-area employee's shift appears under the shift's actual
      focus-area tab. Preserve general and absence behavior.
      Done when server data tests cover a conflicting employee/cell focus area and
      the mobile tab filter receives the shift's assigned focus area.

- [x] **5. Verify mobile behavior.** Update focused tests and run the affected
      server, contract, and mobile suites, mobile type check, and iOS export.
      Done when the change-history paths pass without modifying unrelated work.

- [x] **6. Add a General shifts schedule tab.** Show a dedicated team-schedule
      tab for general assignments when they exist in the loaded range. It must
      contain only general shifts and remain separate from focus-area tabs and
      absences.
      Done when mobile schedule helper and screen tests cover the tab and its
      filtering behavior.

- [x] **7. Make mobile change status and self labels unambiguous.** Refer to the
      signed-in employee as `You`, and show `New`, `Edit`, or `Del` for every
      changed shift on the home hero, Your Week rows, team schedule, and detail
      card. Preserve previous-shift history where it exists.
      Done when tests cover edited and deleted Your Week rows plus the self label.

- [x] **8. Source mobile indicators from published history.** Match the web
      schedule's published change records instead of comparing draft snapshots.
      Carry the prior published state for edited and deleted rows, including a
      deleted shift whose live schedule cell is empty.
      Done when server tests prove published `new`, `modified`, and `deleted`
      rows reach the mobile contract while draft-only changes do not.

- [x] **9. Balance the shift-detail header.** Vertically center the date tile
      against the title and badge group, and center mixed-height status pills in
      their row. Preserve the compact header at larger font sizes.
      Done when the Android detail card reads as one aligned header rather than
      two independently stacked columns.

- [x] **10. Mirror grid change indications in the web dashboard schedule row.**
      Show the existing `New`, `Edited`, or `Deleted` status on every affected
      pill in the shared admin and super-admin "Your schedule" row, including
      deleted shifts represented by their last published presentation.
      Done when dashboard tests cover new, edited, and deleted pills.

- [x] **11. Refine the previous-shift action.** Render the mobile "View previous
      shift" control as a transparent rounded outline with symmetric horizontal
      padding, rather than a filled footer strip.
      Done when the action is visibly outlined and remains accessible.

- [x] **12. Keep every day visible in mobile Your Week.** Build the personal
      week rows from the loaded date range, not only from shift segments. Show
      an explicit unscheduled state for empty dates, retain deleted shifts from
      their published presentation, and preserve New or Edited indicators on
      changed entries.
      Done when mobile tests cover empty dates plus edited and deleted rows in
      the same Your Week card.

- [x] **13. Scope multi-shift change markers to the changed segment.** Compare
      each current segment with its prior published counterpart before showing
      an Edited marker or previous-value line in a segment row. Keep New and
      Deleted markers visible for every applicable segment.
      Done when a double shift with one edited segment marks only that segment
      in personal and team schedule rows.

- [x] **14. Merge multi-shift change status into the affected segment pill.**
      In multi-shift cards, render `Shift N · Edited` on the changed segment
      instead of a separate entry-level change pill. Keep single-shift status
      pills unchanged.
      Done when the home, Your Week, and detail segment cards show the merged
      label only on the affected shift.

- [x] **15. Tighten mobile multi-shift card hierarchy.** Keep empty week rows
      to the single `Unscheduled` label. Prefix deleted-history summaries with
      `Deleted · Was`. In multi-shift cards, keep each segment's colored job
      pill, put its shift name and combined `Shift N · Edited` pill on one row
      where space allows, and move the time to a dedicated row with relative
      timing trailing at the far right. Render each regular segment's own focus
      area with location/time icons, including the second shift.
      Done when home and detail tests cover the concise empty/deleted copy,
      segment-level status, and the second segment's colored job pill.

- [x] **16. Scope multi-shift previous-value copy to the edited segment.** When
      a double shift has a single edited segment, derive `Was …` from that
      segment's prior name, time, and focus area rather than the whole prior
      entry. Keep the job pill directly under each shift name in Home, Your
      Week, and detail cards.
      Done when the double-shift regression covers only the edited shift's
      prior summary and each card keeps its role immediately below the title.

- [x] **17. Put the featured double-shift job directly below its title.** Move
      the hero's primary shift job ahead of focus area and prior-value metadata,
      matching the second segment and all card variants.
      Done when the hero regression asserts the primary job appears before its
      focus area.

- [x] **18. Keep prior-value copy out of the Home hero.** Preserve previous
      shift details in the shift-detail flow while suppressing `Was …` from the
      featured Home card.
      Done when Home tests cover a changed shift with no prior-value row and a
      schedule row retaining its prior summary.

- [x] **19. Tighten Home hero information groups.** Keep the shift title, its
      shift pill, and job pill tightly grouped; separate that from the focus
      area and time/progress group.
      Done when the hero preserves title-job-focus ordering with the shift pill
      directly beside its title.

- [x] **20. Apply the same hierarchy to detail shift segments.** Keep each
      detail-card segment's shift name, change pill, and job pill together,
      then separate its focus area and time metadata with a clear visual gap.
      Done when double-shift detail cards keep the role immediately under its
      shift title and the focus/time rows read as one secondary group.

- [x] **21. Keep Your Week time labels text-only.** Remove the clock icon from
      compact personal-week rows while retaining the textual time range and
      icons in the detail-card metadata.
      Done when Your Week rows show their time without a clock icon.

- [x] **22. Align split-shift pills in Your Week.** Anchor `Shift 1` and
      `Shift 2` labels to the trailing edge of their compact rows while their
      respective shift names remain on the leading edge.
      Done when every multi-shift Your Week row keeps its segment pill right-aligned.

- [x] **23. Give Your Week split-shift pills the true trailing edge.** Remove
      the redundant navigation chevron from multi-shift rows so their `Shift N`
      pill aligns with the detail-card trailing edge; leave the row tappable.
      Done when split-shift labels sit at the full right edge of their rows.

- [x] **24. Match single edited pills to split-shift pills in Your Week.** Give
      a single edited shift the same compact outlined styling and trailing-edge
      placement as `Shift N · Edited`, without implying it is a multi-shift.
      Done when the single `Edited` label aligns and reads like the split pill.

- [x] **25. Retain Your Week navigation chevrons.** Keep the chevron on every
      personal-week row, including split shifts and single edited shifts.
      Done when status pills align before, not instead of, the row chevron.

- [x] **26. Remove Your Week navigation chevrons.** Remove the redundant
      chevrons from every personal-week row while preserving the row press
      behavior and trailing change-pill alignment.
      Done when Your Week contains no row chevrons and every row still opens.

- [x] **27. Preserve deleted history on otherwise unscheduled days.** Build
      personal-week deleted rows from their prior published presentation when
      their current schedule cell has no segments.
      Done when an otherwise unscheduled day renders its deleted shift and
      `Deleted · Was …` details instead of only `Unscheduled`.

- [x] **28. Match single edited detail pills to segment pills.** Place a
      single shift's `Edited` pill at the trailing edge of its title row, using
      the compact outlined segment-pill treatment while keeping its job below.
      Done when single and split detail cards share the same status-pill hierarchy.

- [x] **29. Simplify multi-shift detail headers.** Remove `Multiple Shifts`
      and the count pill. Keep segment numbering only as part of an affected
      segment's change pill, such as `Shift 2 · Edited`.
      Done when unchanged segments have no numbered pill and detail cards show
      no multi-shift summary title or count.

- [x] **30. Keep a single detail change pill beside its title.** Place the
      single-shift `Edited` pill directly after the shift name rather than at
      the far trailing edge; keep the job pill below.
      Done when the shift title and its change pill read as one compact group.

- [x] **31. Restore the multi-shift detail title without its count.** Show
      `Multiple Shifts` above the segment cards, but do not show an `x shifts`
      count pill beneath it. Keep generic segment numbering out of the card.
      Done when only the title remains in the multi-shift header.

- [x] **32. Simplify prior-history sheet headings.** Name the sheet `Previous
shift` or `Previous shifts` based on its segment count, and show a single
      prior name directly without a calendar icon or repeated field label.
      Done when prior history has one clear, count-aware heading.

- [x] **33. Omit segment numbers from detail-card change pills.** In shift
      detail segments, label an affected segment `Edited` rather than
      `Shift N · Edited`; its adjacent shift name supplies the context.
      Done when only the status appears in detail-card change pills.

- [x] **34. Show deleted absence history on unscheduled days.** Preserve the
      `Deleted · Was …` row for a deleted absence whose effective day has no
      schedule segments, matching deleted regular shifts.
      Done when both deleted shifts and absence types retain their prior copy.

- [x] **35. Emit deleted published history without a schedule-cell row.** Build
      an entry directly from the latest deleted published change when its cell
      was removed, so Your Week can render `Deleted · Was …` on that otherwise
      unscheduled day.
      Done when the server-data test covers a missing schedule cell and the
      mobile personal-week path receives the deleted absence or shift.

- [x] **36. Keep deleted-only days visibly unscheduled.** In Your Week, retain
      the `Unscheduled` primary state when no active shift remains, and render
      deleted published shifts or absences only as `Deleted · Was …` history
      beneath it.
      Done when deleted-only shift and absence rows show both `Unscheduled` and
      their prior value without a deleted shift card or status pill.

- [x] **37. Keep deleted-day history concise.** When an otherwise unscheduled
      day shows prior published history, label it `Was …`; the `Unscheduled`
      state already communicates that the shift is no longer active.
      Done when deleted regular shifts and absence types show `Was …` without
      a redundant deleted prefix.

- [x] **38. Keep deleted history out of active schedule behavior.** Treat
      deleted publications as display-only history: exclude them from the Home
      hero, weekly hours, and request actions; render them as quiet `Was …`
      context on both deleted-only and mixed days; and batch missing-cell
      employee lookups. Collapse a deleted double shift into one prior-history
      summary.
      Done when server, core, route, detail, and schedule-screen regressions
      cover the audited cases.

- [x] **39. Surface recently published changes on web dashboard schedules.**
      Reuse the grid's published change source for the user home hero and the
      personal schedule rows on user, admin, and super-admin dashboards. The
      user home must expose the same clear status and prior-value detail as the
      mobile home; dashboard rows retain compact grid-style pills, including
      deleted history where a current cell no longer exists.
      Done when recently published new, edited, and deleted shifts appear on
      the correct web home and dashboard surfaces without treating history as
      active work.

- [x] **40. Restore meaningful New labels and repair dashboard history.** Show
      `New` only when a later publication adds a shift to a date already covered
      by an older publication; keep initial period publication visually clean.
      Derive change state per segment so an unchanged sibling in a multi-shift
      cell remains unmarked. Load bounded publish history overlapping the
      selected web period (plus the hero look-ahead), including completed
      periods. Repair F-62, F-63, and F-64.
      Done when web and mobile tests cover initial publication, later additions,
      single-segment changes in mixed double shifts, completed-period history,
      and bounded history queries.

- [x] **41. Give removed split-shift segments a clear edited status.**
      When a published double shift becomes a single shift, keep the surviving
      segment unmarked and expose the removed segment through the standard
      `Edited` chip, with its former shift/job in the detail rather than a
      vague changed summary.
      Done when grid tests cover a one-segment deletion and a mixed edited-plus-
      deleted split shift.

- [x] **42. Reuse the shift detail hover card for change chips.** When shift
      hover cards are enabled, let their parent card provide the sole hover
      detail for a status chip, including deleted shifts. Retain the concise
      change-only hover only when the organization disables shift hover cards.
      Done when grid regressions cover enabled and disabled shift hover-card
      behavior without nested competing popovers.

- [x] **43. Keep grid change chips fully visible and aligned.** Render every
      chip as the same top-left edge overlay without changing an active pill's
      visual dimensions, height, or vertical placement. Move competing mentored
      and note markers clear of that corner.
      Done when single, split, absence, and deleted grid chips share the same
      visible placement without covering the other cell markers.

## Verify

- Focused mobile contract and server-data tests
- `npm --workspace @dubgrid/mobile run test`
- `npm --workspace @dubgrid/mobile run type-check`
- `CI=1 npx expo export --platform ios --output-dir /tmp/dubgrid-mobile-shift-change-export`

## Out of scope

- Web schedule highlighting changes
- Reworking the completed mobile shift-detail card layout
- Persisting a separate mobile-only audit history
