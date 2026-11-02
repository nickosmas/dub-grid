# Current Feature

## Departments, Areas and Administrative Teams

**Type:** Fix
**Status:** not started
**Branch:** `claude/departments-areas-administrative-teams` (cloud session; merges into `dev` by pull request)

## The problem

The names for how an organization is organized don't match how people describe their workplace:

- **Management departments** act as teams, not departments, and most of their members aren't managers. For example, Reception isn't a department, and being on it grants nothing (permissions are per person; `departments.permissions` is vestigial).
- **Focus areas** isn't a term care facilities use, and the product shouldn't use care-only words either, since it may serve other industries (for example, student work scheduling at colleges).
- **Scheduled departments** describes how the system behaves, not anything staff say.

The defaults behind the configurable labels can't be changed cleanly either:

- **The defaults are copied, not shared.** "Focus Areas" is hardcoded as a fallback in about 51 places on web and nine on mobile; "Scheduled Departments" in the mapper, Settings, People and the Gridmaster create route.
- **The default is saved as if it were a choice.** The Gridmaster create route writes `focus_area_label = 'Focus Areas'` and `department_label = 'Scheduled Departments'` (`apps/web/src/app/api/gridmaster/organizations/manage/route.ts:377-380`). Settings > Labels saves the shown default when the field is empty (`apps/web/src/components/settings/OrganizationLabels.tsx:103`). So most organizations that never chose a label store the old default text, and changing the default would reach almost none of them.

## The fix

KISS: names and defaults only. The structure, data model and behavior stay as they are (owner decisions, 2026-11-02).

| Today | Becomes |
|---|---|
| Scheduled departments | **Departments** (default of the existing department label) |
| Focus areas | **Areas** (default of the existing area label, with presets) |
| Management departments | **Administrative Teams** (fixed name, always spelled out, never shortened) |
| One management department | **a team** ("Add team", "Edit teams") |
| People page **Management** view | **Administrative Teams** |

**Labels:**

- **One shared default** for each label (Areas, Departments, Certifications, Roles) in `packages/domain`. Every web and mobile fallback reads it.
- **Store only a choice.** A label that is empty, or equal to the default, is stored as `NULL`. `NULL` means "use the product default".
- **One data-only migration** resets the old stored defaults to `NULL`: `focus_area_label = 'Focus Areas'` and `department_label = 'Scheduled Departments'`. Custom labels (Calm Haven's "Wings") are untouched. An organization that deliberately chose "Focus Areas" will see "Areas" and can set it back.
- **Presets** for the area label: Areas, Units, Wings, Halls, Floors, Neighborhoods, Desks and Locations, as one-tap choices beside the free-text field. They appear in Settings > Labels, the Gridmaster setup wizard and the onboarding Identity step.
- **No team label** for now; "Administrative Teams" is fixed.

**Must not break:**

- **The data model.** `departments.type` (`scheduled` and `management`), `focus_areas`, and every `department_ids` and `focus_area_ids` array keep their names and values. Code identifiers keep their names, the way `indicator` stays for schedule notes.
- **Being on the schedule or not.** `isOnSchedule`, `isManagementUser` and `isManagementOnly` decide the same things: Dashboard and Home hiding, Away, seats, and Add to schedule. Someone can still be on an area and an administrative team at once, and move on and off the grid while keeping their team.
- **Permissions, invitations, imports and the access role.** Imports still match teams by name.
- **Plural and singular forms.** They still come from `terminology-copy.ts`, so "Areas" reads "area" in sentences.
- **Label limits.** A label still has 50 characters and no URLs.
- **Older mobile builds.** The mobile API already sends the resolved label (`apps/web/src/features/mobile/server/data.ts:2157`), so they show the new default with no app update.
- **Deploy order.** The migration is safe before or after the web release, because old code already shows "Focus Areas" for `NULL`. It is still reported before the release PR merges, per the production migration rule in `AGENTS.md`.

## Build steps

### 1. Shared defaults, and storing only a choice

- Add the label defaults (Areas, Departments, Certifications, Roles) to `packages/domain`, with a helper that turns a submitted label into the value to store (`NULL` when empty or equal to the default).
- `rowToOrganizationTerminology` (`apps/web/src/lib/db/mappers.ts:103`) and `notifications/server/events.ts:500` read the shared defaults.
- The settings route (`apps/web/src/app/api/organizations/settings/route.ts:419`), the Gridmaster create route (`manage/route.ts:377-380`), the Gridmaster Overview tab save (`organization-detail/OverviewTab.tsx:94`) and Settings > Labels store through the helper.

**Done when:** unit tests show an empty label, the default, and the old default ("Focus Areas", "Scheduled Departments") all store `NULL`, while a custom label is trimmed and stored. Route tests show the create route writes `NULL` for an unchanged label. `npm run type-check` and `npm run test` pass.

### 2. Migration 113: reset the stored old defaults

- `supabase/migrations/113_label_defaults.sql`, using the next free number on `dev` at build time, is a data-only `UPDATE` of the two old defaults to `NULL`. It is locked in `checksums.sha256`.

**Done when:** `npm run db:migrations:check` passes. A live test against the local stack shows "Focus Areas" becomes `NULL`, "Wings" is unchanged, and the organization reads "Areas".

### 3. Every fallback reads the shared default

- Replace each hardcoded `"Focus Areas"` and `"Scheduled Departments"` fallback and prop default on web and mobile with the shared constant. `rg '"Focus Areas"|"Scheduled Departments"' apps packages` should find only tests and the migration.
- The Labels setting is named after the new default ("Departments label", "Areas label") in `apps/web/src/lib/organization-settings.ts:90-93`. Help text that cites "Focus Areas" as the example (`settings/nav-config.tsx:139`, `onboarding/steps/IdentityStep.tsx:71`) is updated.

**Done when:** the search above is clean, tests that asserted the old default are updated, and type-check, lint and tests pass.

### 4. Administrative Teams on web

- **Settings > Departments** (`DepartmentsSettings.tsx`, `SettingsPage.tsx`): the sections are the department label and **Administrative Teams**. Add, rename, archive and the dialogs say "team".
- **People** (`MembersSection.tsx`, `StaffView.tsx`, `useManagementFilters.ts`, `ManagementStaffPanel.tsx`): the view toggle reads **On Schedule** and **Administrative Teams**, and so do filters and empty states.
- **Person page and its editor** (`EmployeeManagementAccessModal.tsx`, the staff detail cards, `access-management.ts:185`): "Edit teams" and **Administrative Teams: Reception**.
- **Invite and add** (`InviteEmployeeModal.tsx`, `AddManagementUserToScheduleModal.tsx`): "Invite to an administrative team" for someone who isn't scheduled.
- **Elsewhere:** `Header.tsx`, the dashboard hints (`DashboardPageContent.tsx`, `MyScheduleRow.tsx`), `ProfilePanel.tsx`, the onboarding Structure step, the Gridmaster setup wizard and person card, and the activity log's labels for these records (`lib/audit/registry.ts`).
- The full name never shortens. At 390px wide, the People toggle and Settings section headings show it on one line. If one truncates, widen it rather than shortening the name.

**Done when:** no customer-facing web string says "management department", "Management Departments", "scheduled department" or "Management" for this view. Component tests are updated. Browser screenshots of Settings > Departments, People (both views) and a person page at desktop width and 390px show the names, light and dark.

### 5. Administrative Teams on mobile

- `MANAGEMENT_DEPARTMENT_LABELS` (`apps/mobile/src/shared/lib/departments.ts`) becomes the Administrative Teams wording.
- The People segment (`PeopleScreen.tsx:702`) reads **Administrative Teams** (`FitText` shrinks it to the slot; it never wraps).
- `ProfileWorkScreen.tsx`, `ManagementUserInviteSheet.tsx`, the person detail screen and the mobile API's user-facing messages (`features/mobile/server/routes/*management*`) follow.

**Done when:** no customer-facing mobile string says management department. Mobile tests pass (`npm run test:mobile`). A simulator screenshot of People and a person shows the segment on one line.

### 6. Area label presets

- Settings > Labels, the Gridmaster setup wizard (`OrganizationSetupWizard.tsx:82, 599`) and the onboarding Identity step offer the presets as one-tap choices beside the free-text field. A preset fills the field; the field still takes any name.

**Done when:** a test shows choosing a preset saves it and choosing Areas stores `NULL`. Browser screenshots show the presets in Settings and the wizard.

### 7. Seed data and public docs

- In `seed.ts` and `supabase/seed_*.sql`, comments and printed text use the new names. Calm Haven's team named Administration stays, and reads "Administrative Teams → Administration".
- **Public docs:** `docs/configuration/departments-and-focus-areas.mdx` (title and slug, with a redirect from the old path), `docs/staff/roster.mdx`, `docs/staff/detail-page.mdx`, `docs/configuration/shifts-jobs-and-absences.mdx`, the Labels page (`docs/configuration/terminology.mdx`), and any other page the docs inventory flags. The pages describe customer behavior only.
- `internal/documentation/accuracy-manifest.json` evidence and fingerprints are refreshed (`npm run docs:fingerprint`).

**Done when:** `npm run docs:verify` passes, and the docs say Departments, Areas and Administrative Teams throughout.

## Verify

- `npm run type-check`, `npm run lint`, `npm run lint:rules`, `npm run test`, `npm run db:migrations:check`, `npm run docs:verify` and `npm run build` pass.
- **Calm Haven** (local seed), as a Super Admin:
  - Settings > Departments shows **Departments** (Nursing, Visiting, with Wings) and **Administrative Teams** (Administration, Human Resources, Tech).
  - The grid is unchanged.
  - People's **Administrative Teams** view lists Sullivan, both Crawfords, Henderson, Patterson, Hartwell and Davenport.
  - Taking Carol Henderson off her wings keeps her team, and Add to schedule puts her back.
- **An organization on the default label** (any seed organization with no label set, after the migration) shows "Areas" and "Departments" on web and in the app, and Settings > Labels shows the field empty with the presets.
- **A new organization** from the Gridmaster wizard with labels left alone stores `NULL` for both.
