# Fix: People filters use capsules, not tabs

**Type:** Fix
**Status:** complete
**Branch:** `fix/filter-capsules`
**Owner decision (2026-11-11):** "Do not use tabs for filters e.g access role,
use capsules instead." Web only; the mobile filter sheet is unchanged.

## The problem

The People filter panel (#488) showed its short choices (Employment, Access
role, Phone, and on Administrative Teams Access role and Invitation) as the
segmented control, which reads as tabs.

## The change

- `components/ui/capsule-choices.tsx`: `CapsuleChoices`, the same props as
  `SpanTabs` (items, value, onChange, a count with its screen-reader label),
  drawn as a wrapping row of outlined pills (`.dg-capsules`, `.dg-capsule`).
  The chosen one is tinted brand (`--dg-color-brand-bg`, its border and text),
  never filled with brand blue. Each is a pressed or unpressed button in a
  named group, as before.
- `StaffFilterPopover.tsx` and `ManagementFilterPopover.tsx` use it in place
  of `SpanTabs`. Dropdowns stay for the long lists.
- `app-ui.css`: every filter control fills its row, and the phone sheet's
  segment stretching is gone, since capsules wrap.
- `coding-standards.md`: a filter in a filter panel is never tabs; its few
  choices are capsules, a long list a dropdown.
- Spacing (owner, "Fix spacing and styling"): capsules use the dropdowns'
  text color and weight. On desktop every control sits on a 34px line with
  6px between rows, so each label centers on its control and the panel fits
  under the toolbar at 1280x900 with no scroll and no scroll cue (before, it
  scrolled and the cue sat over the Access role capsules). The panel is 500px
  wide so Access role stays on one line, and the divider is visible. On the
  phone sheet each label sits 8px above its control, groups are 18px apart,
  and capsules are 36px tall for touch.

## Result

- `capsule-choices.test.tsx`: the chosen capsule alone is pressed, a click
  reports the new value, a count is named and a zero count left out.
- The web suite passed (297 files, 3348 tests), and type-check and lint are clean.
- Seen in the browser at 1280x900, light and dark: choosing Admin narrows the
  list, the Filter button counts 1 and the bar shows "Access role: Admin". At
  390x844 the sheet stacks each label over its capsules, nothing scrolls
  sideways, and Done stays in view.
- After the spacing pass, Playwright captures at 1280x900 (light and dark)
  measured every label's center equal to its control's, and the panel body
  at 357 of 357px (no overflow).

## Not done

Other filters outside the panel still use the segmented control: the
Schedule toolbar's focus areas, Alerts, Billing history, Gridmaster's staff
status and the import review's row filter. The owner has not said whether
they follow.
