# Fix: Native form content in sheets and editors

**Type:** Fix
**Status:** complete
**Completed:** 2026-10-31
**Branch:** `fix/sheet-content-pass`

## The problem

Owner, 2026-10-31, about sheet and editor content across the app:

- Some text was too small to read comfortably, such as the 12pt "Employment"
  and "Wings" labels.
- Field names were repeated: a label over a field whose placeholder said the
  same thing, and a section title ("Staffing") over a group title
  ("Employment").
- Fields didn't stand out from the page: inputs were a hairline on the gray
  background.
- Selected rows in a pick-many list weren't distinct enough.
- There was a divider after the last row of a group.
- The Change status sheet (mobile) and dialog (web) repeated where the person
  stands, which the page behind them already shows.

## The fix

**iOS headers.** A group's header uses the system's increased-prominence
style, sentence case at 17pt semibold in the text colour, instead of a small
gray caption. The person editor, My work profile, Add person and Add to
schedule drop their Staffing and Assignments titles, so each group (such as
Employment, Certifications or Wings) has one title.

**iOS fields.** A panel holding fields is a grouped form: a white card with
one row per field, the name on the leading edge and the value on the trailing
edge, and separators only between rows. A placeholder that repeats the name
is dropped, and an optional field says "Optional". A multi-line field is a
text area under its section title. A field with no panel gets its own card,
and the invite sheet's fields share one.

**iOS dates.** Every date field (Starts, Return date, Last day, First day,
Ends) is a row like Calendar's: the date sits in a gray capsule that turns
the tint while its calendar is open under it in the same card, and the hint
reads as the group's footer.

**Selection.**

- iOS pick-many lists use the system's edit-mode marks: an empty ring that
  fills with the tint and a white checkmark.
- iOS pick-one lists keep the bare checkmark.
- Android keeps its checkboxes and radios, with a larger brand subheader.

**Change status.**

- Neither the sheet nor the web dialog shows the current-status or
  planned-change cards, and neither has a "Change to" label.
- The Reason placeholder reads "Optional, e.g. Family leave".
- The People doc says the card already shows where they stand.

## Verify

- **iOS Simulator, person editor:** one header per group and form rows.
  Wings shows filled and empty rings, Employment a checkmark, and there's no
  divider after the last row.
- **iOS Simulator, Change status:** the sheet starts at the choices. Away
  shows the Reason row and the Starts and Return date rows, and Starts opens
  its calendar inline.
- **Checks:** the mobile suite (1,538 tests), the web status tests (119),
  type-check (mobile and web), lint and `docs:check`.
- **Android:** not run.
