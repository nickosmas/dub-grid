# Fix: Add person's first day test broke on a month's last day

**Type:** Fix
**Status:** verified

## The problem

`AddPersonSheet`'s first day test (51g4) picks tomorrow from the mobile
calendar, which opens on the current month, so on a month's last day
tomorrow is on the next page and the test fails. Found on 2026-10-29 beside
the three `PersonDetailScreen` Change status tests that broke the same way
near the month's end; the "Away days display and past day editing" session
fixed those in 5db01127.

## The fix

Test-only: when tomorrow's button isn't on the page, the test turns to Next
month first, as a person would.

## Checks

- Mobile people suites pass, 164 of 164.
