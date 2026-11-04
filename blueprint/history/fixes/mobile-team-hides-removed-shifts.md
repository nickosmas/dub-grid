# Fix: The app's team schedule leaves out removed shifts

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-team-hides-removed-shifts`

## The problem

- After a publish removed someone's shift, the app's team schedule still
  listed them under that shift with a red Deleted pill and "Was Day Shift".
  On a day where a publish cleared four people, the team list read as if
  they worked it.
- The schedule area capsule counted them too (Skilled Nursing 8 with half
  of them removed).
- Nobody schedules in the app, so that history only helps someone editing
  the schedule, which happens on the web.

## The fix

- `/org/schedule` leaves out each entry whose change is a removal, for
  every viewer (`loadMobileOrgSchedulePayload`). The team list, its area
  counts, the admin Home Team view and the teammates in a shift's details
  all read it, so a removed person is simply not scheduled that day.
- `/me/schedule` is unchanged: the person whose shift was removed still sees
  it in Your Week, since that may be how they learn not to come in (owner,
  2026-11-03).
- Other changes keep their "Was" line on the team schedule, such as a shift
  that became an absence or moved times.
- The server change reaches every installed app version at once; no new
  build is needed.

## Checks

- `read.test.ts`: an editor's team schedule drops the removed entry, and the
  same entries through `/me/schedule` keep it.
- `docs:check`, with the mobile schedule page saying so.
