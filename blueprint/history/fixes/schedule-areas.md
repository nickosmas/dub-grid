# Current Feature

## Schedule Areas

**Type:** Fix
**Status:** verified
**Branch:** `claude/schedule-areas` (cloud session; merges into `dev` by pull request)

## The problem

"Areas", the default name for the groups that make up the schedule grid (#283), doesn't say what an area is for. The owner wants it to read **Schedule Areas** (owner, 2026-11-02).

## The fix

- **Default label:** Schedule Areas, so sentences built from it read "Add schedule area", "All schedule areas", "At least one schedule area is required". The examples hint starts with it: e.g. Schedule Areas, Units, Wings, Halls, Floors, Neighborhoods, Locations.
- **Fixed copy:** every message #283 changed from "focus area" to "area" now says "schedule area" (owner: yes to the wider sweep), plus the few that predated it: errors, the "Any schedule area" option, CSV and Gridmaster column headings, permission names ("View schedule areas"), activity-log nouns, the empty grid section and the import error.
- **Docs:** the public pages say schedule area(s); the Departments page is titled "Departments and Schedule Areas" (its path stays `/configuration/departments-and-areas`), and the Labels table lists Schedule Areas.
- **Must not break:** custom labels (Calm Haven's "Wings"), how labels are saved (blank or the default stores `NULL`), and #283's other wording (Departments, Administrative Teams). The compact job summary ("1 dept · 2 area · 3 shift") and "each area of DubGrid" on the permissions page keep their own meaning.
- **No migration:** organizations on the default read the new name; migration 115 (unreleased) resets old stored defaults to it.

## Build steps

### 1. Default, examples and fixed copy

- [x] Built and approved

### 2. Public docs

- [x] Built and approved

## Completion notes

- The copy was rebuilt from #283's own diff: each line where "focus area" became "area" was rewritten from its current text with "schedule area" in the same place, so #283's other wording stays; template strings and hand-written docs were done by hand.
- Checks in the cloud session: domain tests (291), mobile tests (1,561), web tests related to every changed file (2,352, one fix applied), web and mobile type-check, lint on the changed files, `npx prettier --check .`, `npm run docs:check:closed`, `docs:validate` and `docs:links`. The full suites, build and E2E run in CI.
