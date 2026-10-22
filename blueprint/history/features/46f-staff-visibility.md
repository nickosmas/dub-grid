# 46f - Staff visibility setting

**Type:** Feature
**Status:** complete
**Branch:** `feature/46f-staff-visibility` (cut from `dev` at 5b1388dd)

### Goal

An organization chooses what staff see after a publish: what each shift
changed from, and who published. Hidden means hidden on the server, not only
on screen.

### Decisions (delegated by the owner, 2026-10-21)

| Question          | Decision                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings          | `staff_see_shift_changes` and `staff_see_publisher` on `organizations`, both default on                                                                                                                                                                        |
| Who is staff      | Anyone who cannot edit shifts or publish. Super Admins, Gridmasters and anyone with `canEditShifts` or `canPublishSchedule` always see both                                                                                                                    |
| Details hidden    | Staff keep a plain mark (New, Changed, Removed) and the alert (46e) without the Before side. A care worker must still learn their shift changed. A change that nets back to the original still shows nothing                                                   |
| Publisher hidden  | "Published <time>" only. Editors' names on cells are author information too, so they are hidden with it                                                                                                                                                        |
| Publisher shown   | Staff now see "Published <time> by <name>" where the hover card and the mobile shift detail already show it to publishers (today staff never do)                                                                                                               |
| Who may change it | Super Admins and Gridmasters (`canManageOrgSettings`), in Settings > Display, under "What staff see"                                                                                                                                                           |
| Database          | Staff apps subscribe to `publish_history` for realtime refreshes, so its rows stay readable; `published_by` loses its `authenticated` column grant, `schedule_publish_changes` loses its `authenticated` grant, and `get_publish_history` refuses non-managers |

### Build steps

- [x] **1. Migration 084 and the org plumbing.** The two columns, a SELECT
      grant on them, the `publish_history` column grants, the
      `schedule_publish_changes` revoke and a manager check in
      `get_publish_history`. Carry the columns through db-types, the domain
      `Organization`, the mapper, `ORGANIZATION_COLS`, the server's mobile org
      select (the app itself needs no switch: the server strips the data),
      `organization-settings.ts`, the settings route and the sandbox clone.
      _Done when_ an integration test proves the defaults, that an
      `authenticated` staff member can read a `publish_history` row but not
      `published_by` or any `schedule_publish_changes` row, that
      `get_publish_history` refuses staff and answers a publisher, and the
      settings route saves both switches.
- [x] **2. One visibility rule on the server.** A shared
      `scheduleViewerVisibility(permissions, org)` returns
      `{ showChangeDetails, showPublisher }`. Apply it in
      `/api/schedule/publish-history/recent` (when details are hidden, fold
      each cell's in-window changes on the server, drop the ones that net to
      nothing, keep the folded kind on every row, null every "from" field and
      `updatedBy`, and set `detailsHidden`), `/api/schedule/published-ranges`,
      `/api/schedule/actor-names` (no names for a viewer who may not see
      authors), the mobile schedule entries (`previousPresentation`,
      `publishedByName`) and the mobile admin dashboard's publish line.
      _Done when_ route tests cover each switch for staff and for a
      publisher, including a net-zero cell and a new-then-edited cell.
- [x] **3. Plain marks on web.** A change with `detailsHidden` shows a plain
      New, Changed or Removed mark on the grid (chip and deleted pill with no
      shift named), the dashboards and "My schedule", with no "Was" text,
      hover card or Before side. A publisher name the server sent is shown to
      staff as "Published <time> by <name>".
      _Done when_ unit tests cover the hidden badge result and the staff
      dashboard's hidden rows, and the shown publisher reaches the grid's
      label.
- [x] **4. Plain marks on mobile.** Without `previousPresentation` a modified
      or removed shift keeps its chip and drops "Was" and "View previous
      shift"; a sent publisher name shows in the shift detail footer.
      _Done when_ mobile tests cover both.
- [x] **5. Settings switches.** Two switches in Settings > Display under
      "What staff see", saved through the settings route, with one line each
      saying what staff will see.
      _Done when_ a component test saves each switch.
- [x] **6. Qualification and docs.** In the browser as a Super Admin and a
      staff member (QA accounts), turn each switch off and on and check the
      grid, the staff dashboard and the network responses. Update the public
      settings and schedule pages and their fingerprints.
      _Done when_ the staff responses carry no "from" state or publisher id
      while hidden, the screens match, and `docs:check` passes.

### Evidence

Local, 2026-10-21, this branch's dev server, Calm Haven:

- As `qa-super-admin`, Settings > Display shows "What staff see after a
  publish" with both switches; turning them off rewrites each description
  and Save stores `false`/`false`. A Super Admin still receives all 14
  in-window changes with their earlier shift and the publisher on all 9
  publishes.
- As `qa-regular` with both off, `/recent` sends 2 folded changes, every
  "from" field null, `detailsHidden` on each, no `updatedBy` and no
  `publishedBy`; `published-ranges` names no publisher; `actor-names`
  returns no names. The grid marks the two cells "Edited" with "Changed
  since the last publish." and the publish time, and the hover card shows
  the current day with no Before side or name.
- Switched back on, staff receive all 14 changes and the grid's chip reads
  "Was ... Published ... by QA SuperAdmin."
- Gates: `type-check`, `lint` (2 existing warnings), `test:mobile` pass;
  `test:web` passes except `org-isolation.integration`, which fails on
  `shift_request_draft_cells`, a function another session's unmerged
  migration put into the shared local database.

### Verify

`npm run type-check`, `npm run lint`, `npm run test`, `npm run build`,
`npm run db:migrations:check` and `npm run docs:check` pass.

### Out of scope

- The alerts themselves (46e), which read the same rule.
- Notification rows already written with `publishedBy` in their metadata.
- `fetchShifts` cell rows' `created_by` / `updated_by` ids: without names they
  say nothing, and the name lookup is closed.
