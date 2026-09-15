# Fix: Safer scheduler staffing choices

**Type:** Fix
**Status:** verified

## The problem

The open-shift staffing dialog technically includes an eligible scheduler but
does not identify them as “You.” It auto-selects the first candidate, can retain
a selection after search hides that person, and describes existing work only as
“Already working that day.” Candidate eligibility also checks only the selected
date, so adjacent-day overnight work can overlap unnoticed.
Staff with an absence are hidden entirely, preventing a scheduler from seeing
the absence and overriding it when filling an opening.

## The fix

Make self-assignment explicit without auto-selecting anyone, show each
candidate's exact existing shift/job and time, clear selections that disappear
from the visible results, and exclude candidates whose previous-day overnight
work or next-day work overlaps the opening. Preserve qualification rules,
same-day split-shift merging, draft/publish behavior, and regular-staff
volunteering. Keep absent staff eligible, label their exact absence type, and
replace the absence with the selected worked assignment in the draft.

## Build steps

- [x] **Improve staffing candidate safety and context** - extend candidate data
      with aligned existing assignment/time details and adjacent-day schedule
      state, apply cross-date conflict filtering, identify and pin the current
      employee as “You,” require an explicit visible selection, and use a clear
      self-assignment action label. _Done when:_ focused tests prove self rows,
      exact existing work details, no initial or hidden assignment target,
      previous/next-day overnight exclusions, and unchanged same-day adjacent
      eligibility and assignment behavior; absent staff remain visible with the
      exact absence type and can be assigned through the draft workflow.

## Verify

- Run the focused staffing helper and modal tests.
- Run web type-check, lint, the full web test suite, and the production build.
- Inspect the staffing modal in the browser when an authenticated local session
  is available; otherwise disclose that visual evidence was unavailable.
