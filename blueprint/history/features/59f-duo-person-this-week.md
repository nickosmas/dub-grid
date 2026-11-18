# Feature: This week on a person's page

**From build-plan:** feature 59f
**Status:** verified
**Branch:** `feature/59f-duo-person-this-week`

## Goal

A person's page shows This week, their shift each day, and above it the days
you work the same shift with them ("Working with you this week"), in every
pose and on every phone. Staff already see no contact details there.

## Design reference

- The "DubGrid on iPhone Duo" canvas, rows "People" and "Staff: People"
  (https://claude.ai/artifact/8z9jaKNm81HL28DHfmhSvd).

## In scope

- `buildPersonWeek` and `buildWorkingWithYou` (the shift page's own
  shiftmate rule), and `PersonWeek` on the person page after the status.
- Only for someone who can see the team schedule, read from it.
- The app section of the staff detail page doc.

## Build steps

- [x] **Step 1 - Week helpers** - each day's shift, absence or day off, and
      the shared days. _Done when:_ tests cover a week, an absence, a shared
      and an unshared day, and your own page.
- [x] **Step 2 - PersonWeek** - the section on the person page, today in
      brand. _Done when:_ the iPhone Duo simulator shows it beside People (as
      an admin with no shifts, so no shared days).

## Testing

- Unit tests for the helpers; the mobile suite.
