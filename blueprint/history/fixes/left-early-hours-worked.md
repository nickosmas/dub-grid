# Fix: A shift beside an absence says what was worked, and names no unknown author

**Type:** Fix
**Status:** verified
**Branch:** `fix/left-early-hours`

## The problem

- **"Custom time" on a left-early shift.** The grid's hover card, the panel's summary
  and the panel's time card all called the shift's shortened times custom, though the
  absence beside it is why they differ.
- **No hours worked.** The hover card gave a Was total and no hours for the day as it
  stands, so a left-early day never said what was worked.
- **"Unknown author" while names load.** The hover card and Corrected day card printed
  it until the name lookup answered. On a local dev server that took about 9 seconds,
  because the lookup restarts as the schedule's data arrives. Afterwards the name was
  right, so the line was false rather than the data missing.

## The fix

- **Hover card.** Each shift names its hours, "7:00 AM - 3:30 PM · 8 hrs". Beside an
  absence that reads "12:00 AM - 4:00 AM · 4 hrs worked", the absence reads "4:00 AM -
  8:00 AM, not worked", and "Custom time" is gone. A shift's hours count its break, as
  on every change line.
- **Panel.** The time card beside an absence is called **Time worked**, and the summary
  on a repeating day says "worked" in place of "custom time".
- **Names.** A name that hasn't loaded is left out until it arrives. Someone the lookup
  can't find still reads "Deleted user".

## Verify

- `ScheduleGrid`, `ShiftEditPanel` and `gridHelpers` tests pass, with new cases for the
  hover card and the Time worked label.
- Headless Chromium against the local stack on Kenneth Crawford's corrected Oct 30: the
  hover card and panel read as above, and the lookup answered 200 with every name. The
  run predates the change to how a loading name reads, which the tests cover.
- Not changed: "Added custom time" in the change details from `shift-diff-badges`, and
  the lookup restarting, which only lengthens the wait.
