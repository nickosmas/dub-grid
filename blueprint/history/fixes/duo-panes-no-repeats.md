# Fix: iPhone Duo panes name their page, not what the list already says

**Type:** Fix
**Status:** verified

## The problem

Open, each right pane repeated what the list on its left already showed:

- Home and Schedule headed the day with "You're not scheduled" or "Day
  overview" over the date, which the Home header and the month calendar
  already show.
- The day's overview said "You're not scheduled this day" on every day the
  viewer wasn't working.
- A shift picked in a list was headed with its date and "Your shift".
- Profile settings were headed "Profile" and the setting's name, the row
  just picked, and the Profile hub's Departments sat beside Profile details,
  which lists the same departments.
- An alert repeated its time from the picked row.

## The fix

- Each pane is titled by its page alone (owner, 2026-11-18): "Day
  overview", "Your shift" or "Shift detail", and each Profile setting's name,
  with no date or "Profile" line over it. Alerts is the exception: there the
  list may not name the day, so a shift or day an alert points to keeps the
  date above its title.
- "You work this day" shows only when the viewer works that day.
- Split, the Profile hub leaves out Departments, which Profile details
  beside it lists.
- A plain alert's pane keeps the alert's title and drops the time over it.
- The empty day reads "Nobody works this day." (Home) or "No open shifts or
  requests this day." (Schedule).

## Verify

- iPhone Duo simulator, dark, as an admin: Home (My schedule and Team),
  Schedule, Alerts, and Profile with Profile details and Security & sessions
  picked.
