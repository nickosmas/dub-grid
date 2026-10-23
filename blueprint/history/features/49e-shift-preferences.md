# Feature: Shift preferences

**From build-plan:** feature 49e (parent 49, Schedule Builder refinements)
**Status:** verified
**Branch:** `feature/49e-shift-preferences` (cut from `dev` at d3c5a63a)

## Goal

A manager can record which shifts a person wants, flexibly ("prefers") or
strictly ("only"), on the Recurring Shifts page, and the Schedule Builder
honours it.

## Decisions (owner, 2026-10-23)

- **Where:** People > Recurring Shifts. A preference button beside each name
  opens a dialog (No preference, Prefers these shifts, Only these shifts,
  then the shifts from the person's focus areas and the global ones); the
  preference shows under the name ("Only: Evening Shift") and saves at once,
  apart from the grid's draft.
- **Only:** Auto-build and the suggestions never give the person another
  shift; Not suggested says "works only their chosen shifts". **Prefers:**
  between people who would fill a shift the same way, those who prefer it go
  first and those who prefer other shifts last, after keeping days off
  together (owner order: coverage, five days, pairs, 40 hours, preference,
  weekends and nights, hours). Recurring fills follow the person's own
  pattern and are not changed. The reason shows as "Prefers this shift".
- **Storage:** migration 089, `employee_shift_preferences` (one row per
  person: mode and shift category ids), RLS on with no policies, closed to
  `anon` and `authenticated`. The recurring route reads it for anyone who can
  view recurring shifts and writes it for anyone who can manage them, after
  checking the person and every shift belong to the organization; each save
  is audited ("Saved a shift preference").
- Not copied into Test Sandbox clones.

## Build steps

- [x] **Step 1 - Migration 089** with a live-DB test (one row per person,
      checks, closed to browser roles, gone with the person).
- [x] **Step 2 - Route** `fetchShiftPreferences` and `saveShiftPreference`,
      with tests for reading, saving, foreign person or shift, clearing and
      the manage permission.
- [x] **Step 3 - Rules** `onlyShifts` availability and the preference key
      in fairness, tested in schedule-core and the web adapter.
- [x] **Step 4 - UI** `ShiftPreferenceModal` on the Recurring Shifts page;
      the Schedule page loads preferences when the builder opens.
- [x] **Step 5 - Docs** the Recurring Shifts and Auto-build guides; the
      inventory regenerated for 089.

## Outcome (2026-10-23)

- **Evidence:** schedule-core 278 tests; web 4,219 across `src/__tests__`,
  schedule, the schedule routes, components, lib and the schedule client
  (route tests, adapter tests, `describeShiftPreference`, the audit registry,
  the impersonation route check, and the RLS inventory now listing the
  table); migration test 4 of 4 against the local database inside a
  rollback; type-check, lint, `db:migrations:check` and `docs:check:closed`
  clean. Migration 089 was applied to the shared local database with
  `supabase migration up`, which also applied 088, missing there though
  already on `dev` and in production. Browser, Calm Haven: William Harper's
  dialog offered Day and Evening Shift, kept Save disabled until a shift
  was chosen, and saved "Only: Evening Shift"; a build of Nov 1 to 14 then
  used 6 people instead of 7, and a short Day Shift cell's Not suggested
  read "William Harper: works only their chosen shifts". The preference and
  the temporary requirement were removed afterwards; no build was applied.
