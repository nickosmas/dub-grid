# Fix: iPhone Duo panes say nothing the list beside them already says

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
- An alert repeated its title and time from the picked row.

## The fix

- The day's overview and the shift page draw no heading in a pane. Alerts
  is the exception: there the list may not name the day, so a shift or day an
  alert points to is headed with its date alone.
- "You work this day" shows only when the viewer works that day.
- Profile setting panes and alert panes carry no title. Split, the Profile
  hub leaves out Departments. `PaneTitle` is gone.
- The empty day reads "Nobody works this day." (Home) or "No open shifts or
  requests this day." (Schedule).

## Verify

- iPhone Duo simulator, dark, as an admin: Home (My schedule and Team),
  Schedule, Alerts, and Profile with Profile details and Security & sessions
  picked.
