# Fix: Timezone-pinned tests set TZ too late

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-12

### The problem

`ShiftEditPanel > Repeat mode > uses the custom repeat calendar` failed on
`dev` on any machine west of UTC: the repeat start field read "Sun, Jan 14,
2024" for a shift on Monday, January 15, so "January 2024" and the selected
day were not found.

The suite pinned UTC with `process.env.TZ = "UTC"` on its first line, but ES
imports are hoisted above it. `RepeatForm` builds its `Intl.DateTimeFormat`
formatters when its module loads, so they kept the machine's timezone, while
the test's dates were built after the switch to UTC. A UTC midnight formatted
in Pacific time is the evening before.

Not a product bug: a browser's timezone does not change after load.

### The fix

Set `TZ` inside `vi.hoisted()`, which Vitest runs before the imports, in the
failing suite and the four others that used the same pattern
(`UserDashboard`, and the mobile `data`, `dashboard` and `shift-requests`
server tests).

### Verification evidence

The five files ran 123/123 under the system timezone (America/Los_Angeles),
America/New_York, UTC and Pacific/Kiritimati. Before the change the calendar
test failed under America/Los_Angeles and America/New_York, and also on a
clean `dev` worktree.
