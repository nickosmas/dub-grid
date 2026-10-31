# Handoff screen wording

**Type:** Fix
**Status:** complete
**Branch:** `fix/handoff-wording`

The owner did not like the sign-in handoff naming the organization
("Opening your organization"), 2026-10-30, and picked a neutral label:

- "Opening your organization" is now "Getting things ready".
- "Setting up your organization" is now "Setting things up".
- The slow-wait line no longer repeats the title: "This is taking a little
  longer than usual. It's still loading."

"Signing you in" is unchanged. Since #226 these titles show only when the
handoff lasts over 2 seconds. The unit tests and the Playwright specs that wait
on the heading use the new text.

## Evidence

- Transition, setup lock, bootstrap recovery, setup guard, login and
  accept-terms suites pass (77 tests); lint has no errors.
