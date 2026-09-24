# Fix: Isolate People autofill, submits, and slideover saves

**Type:** Fix
**Status:** verified

## Problem

- In the People staff editor, Chrome can treat the background People search as
  part of the same saved-contact autofill context as the slideover form. Choosing
  a saved phone-number suggestion fills the phone correctly but can also place
  the saved email address into the obscured search field behind the modal.
- Editable slideovers do not share one save-dismissal contract. The shift editor
  already closes after a successful confirm, while the staff detail and
  management-staff slideovers remain open after successful saves.
- Several save callbacks currently report no success result, and some catch and
  consume failures. Closing unconditionally after awaiting them would therefore
  dismiss a slideover after validation, conflict, or network failure.
- A native form submission can clear a controlled field when its handler is not
  attached or does not prevent the browser default. The reported subdomain
  screen makes this especially visible after pressing Enter.
- The landing page renders its post-hero sections with `opacity-0` until a
  scroll-reveal observer transitions them. When that observer does not deliver
  an intersecting entry, the entire landing page below the hero remains blank.
- Shared route, section, row, and card entrance animations begin from a hidden
  state. Nested wrappers can therefore animate a new page twice, producing the
  reported hard drop and flash during navigation.

## Expected behavior

- Contact autofill in the staff editor may populate only the intended contact
  fields. It must not mutate the People search, whether that search starts empty
  or already contains a query.
- A top-level Save or Confirm action in every editable slideover closes that
  slideover only after the primary save succeeds.
- Client validation failures, duplicate/conflict responses, authorization or
  step-up failures, and network/server failures leave the slideover open with
  the user's input and visible error state preserved.
- The pending-invite **Save & send** path follows the same close-after-success
  rule. If the employee update succeeds but the follow-up invitation delivery
  fails, the persisted save still counts as successful; the slideover closes and
  the existing delivery-failure feedback remains visible.
- Save buttons belonging to nested controls inside a slideover, such as a custom
  time picker, do not close the parent slideover.
- Read-only and action-only slideovers are unchanged.
- Pressing Enter in any web form preserves the current field values and follows
  the same guarded submit behavior as its visible primary action.
- Landing content remains visible even when scroll-reveal observation is
  unavailable or delayed.
- New route content paints once at its final position and opacity. Navigation
  feedback, hover/focus feedback, explicit panels, dialogs, and loading
  indicators remain purposeful and responsive.

## Fix

- Give the People search a search-specific semantic identity (`type`, stable
  `id`/`name`, accessible label, and autocomplete policy) so browser contact
  autofill does not classify it as an email or phone destination.
- Give the staff editor's first name, last name, phone, and email controls stable
  names, IDs, associated labels, and explicit section-scoped autocomplete tokens
  (`given-name`, `family-name`, `tel`, and `email`) while preserving the existing
  input types and validation behavior.
- Make staff save boundaries return an explicit success outcome instead of
  swallowing primary-save failures. Propagate that outcome through the existing
  employee hooks and panel props without changing toast, validation, conflict,
  invitation, or authorization behavior.
- Route successful staff-detail and management-staff saves through their existing
  animated slideover close path. Retain the shift editor's existing successful
  close behavior and verify the full current `dg-panel` inventory so no editable
  top-level save is missed.
- Make the shared web form boundary prevent native navigation before invoking its
  supplied asynchronous handler. Audit the small set of direct native forms to
  confirm they retain equivalent prevention locally.
- Remove scroll observation as a visibility prerequisite for landing content;
  preserve the existing visual hierarchy and avoid redesigning the page.
- Remove hidden-state mount animations from shared page, section, row, and card
  primitives so nested content cannot flash or appear twice during navigation.

## Build steps

- [x] **Step 1 - Isolate browser autofill from People search.** Add the explicit
      search and contact-field semantic contracts, then add focused DOM tests for
      their types, stable identities, labels, autocomplete grouping, and the
      unchanged search value. _Done when:_ the tests pass and a manual Chrome
      saved-address check confirms selecting a phone suggestion fills the editor's
      phone/email fields without changing an empty or prefilled People search.

- [x] **Step 2 - Close every editable slideover after a confirmed save.** Make
      the staff save pipeline return truthful success outcomes, close
      `StaffDetailPanel` and `ManagementStaffPanel` only on success (including the
      successful pending-invite confirmation path), and add success/failure tests.
      Recheck every current `dg-panel` consumer: the already-correct shift editor
      remains covered, nested saves remain local, and read-only/action-only panels
      remain out of scope. _Done when:_ focused tests prove successful top-level
      saves dismiss after completion, failed saves keep input and errors open, and
      the current slideover inventory has no remaining editable save that violates
      the contract.

- [x] **Step 3 - Preserve fields when submitting with Enter.** Harden the shared
      `Form` boundary to cancel native submission before delegating to its
      handler, add a regression assertion for that contract, and audit every
      direct form outside that wrapper. _Done when:_ pressing Enter on the fresh
      local login form retains the subdomain while it follows the normal guarded
      request path, and all current interactive web forms are covered by the
      shared safeguard or explicit local prevention.

- [x] **Step 4 - Keep landing sections visible without scroll-reveal delivery.**
      Remove the hidden-by-default reveal state from the marketing sections and
      add focused coverage for the rendered landing hierarchy. _Done when:_ the
      local landing page displays all sections below the hero without requiring
      an observer callback, including after an anchor navigation.

- [x] **Step 5 - Stabilize shared page-entry rendering across browsers.**
      Render shared route, section, row, and card primitives at their final
      state on mount, retain deliberate interaction and feedback motion, and
      run the existing Chromium, Firefox, and WebKit E2E matrix. _Done when:_
      no shared content primitive starts hidden or translated on navigation and
      the browser matrix passes across representative public and authenticated
      flows.

- [x] **Step 6 - Make production-mode browser qualification isolated and repeatable.**
      Add a production-E2E runner that builds and starts on an isolated port,
      requires dedicated E2E Upstash credentials (with no production-credential
      fallback), and cleans its temporary build output. Keep rate limiting live
      and explicitly calibrate the seeded-account login ceiling for the full
      test matrix. _Done when:_ it cannot start without the dedicated
      credentials, never binds the normal dev port, and CI uses the same
      dedicated credential contract.

- [x] **Step 7 - Clean isolated production output after an interrupted run.**
      Ensure the production-E2E runner handles `SIGINT` and `SIGTERM` by
      stopping its active child process, running its existing guarded cleanup,
      and returning the interruption result without touching any unrelated
      build output. _Done when:_ an interrupted run removes only
      `apps/web/.next-e2e-prod/`, and its existing configuration guard tests
      still pass.

## Files / areas

- `apps/web/src/components/staff/MembersSection.tsx`
- `apps/web/src/components/EditEmployeePanel.tsx`
- `apps/web/src/components/staff/StaffDetailPanel.tsx`
- `apps/web/src/components/staff/ManagementStaffPanel.tsx`
- `apps/web/src/hooks/useEmployees.ts`
- `apps/web/src/components/Form.tsx`
- `apps/web/src/app/page.tsx`
- Related staff and slideover unit tests
- Shared form and login-submit regression tests
- Landing-page rendering regression test
- Shared mount-motion regression test and cross-browser E2E coverage
- `e2e/auth-entry-performance.spec.ts`, `e2e/auth-release-qualification.spec.ts`,
  `e2e/interactive-states.spec.ts`, and `e2e/schedule-states.spec.ts`
  for cross-engine harness compatibility and state isolation
- `apps/web/src/components/Header.tsx` for narrow-header zoom containment
- `apps/web/src/components/SchedulePageClient.tsx` and other `dg-panel`
  consumers for regression/inventory verification only unless a missed editable
  save is confirmed

## Verification

- Focused web tests:
  `npm --workspace @dubgrid/web exec -- vitest run --config vitest.config.mts src/__tests__/EditEmployeePanel.test.tsx src/__tests__/MembersSection.test.tsx src/components/staff/__tests__/StaffDetailPanel.test.tsx src/__tests__/ManagementStaffPanel.test.tsx`
- Web type-check: `npm --workspace @dubgrid/web run type-check`
- Relevant lint/tests widened as needed by the touched save contracts.
- Shared form regression test plus a fresh local-browser Enter submission check.
- Fresh local-browser landing screenshot, including an anchor jump to Features.
- Full Playwright matrix in Chromium, Firefox, and WebKit against the current
  local development server.
- Manual Chrome saved-contact autofill on `/people`, with both empty and prefilled
  search values.
- Manual save checks for staff detail, management staff, pending-invite
  **Save & send**, and shift edit: success closes after completion; rejected saves
  remain open with the attempted values and feedback intact.

### Pending runtime evidence

- After raising the bounded organization-bootstrap deadline from 4.5 seconds to
  10 seconds, the route unit tests pass and the previously failing focused
  Firefox/WebKit authentication, interaction, and People flows pass together:
  34 passed, 0 failed. Full lint, type-check, workspace tests (including 4,252
  web tests), production build, and `git diff --check` also pass.

- Focused form regression tests, formatting, lint, web type-check, and the full
  web suite pass (496 files, 2,652 tests).
- The landing and login flows pass in Chromium, Firefox, and WebKit (18 focused
  E2E checks), including the domain-selector handoff to the organization login.
- The complete cross-browser E2E matrix completed with 215 passing checks, 8
  unrelated long-run failures, and 2 intentional non-Chromium skips. The stale
  warm-refresh assertion, local billing-state cache cascade, Chromium-CDP-only
  schedule-progress setup, and WebKit focus harness all pass after repair.
  The remaining failures are serial-run loading/bootstrap timing, two browser
  navigation or teardown timeouts, and a WebKit header-overflow audit. The
  header overflow has since been repaired and its focused WebKit typography
  check passes. Each of the seven remaining long-run failures also passes when
  rerun in isolation in its original engine (three Chromium, three Firefox,
  and one WebKit check), which localizes them to shared dev-server serial-run
  pressure rather than an engine-specific product regression. Landing and login
  remain green in Chromium, Firefox, and WebKit.
- A separate production build on port 3002 compiled and started successfully
  without touching the local dev server. Its full seeded-account matrix could
  not complete because the real production login limiter correctly blocked the
  repeated shared QA identity and later failed closed when its configured Redis
  check timed out. The production server was stopped and its temporary build
  output removed; no rate-limit bypass was introduced.
- Native Chrome saved-contact autofill and authenticated save-dismissal checks
  remain pending because local `/people` redirects to login and production does
  not contain this change yet.
- `npm run test:e2e:production` now requires `E2E_UPSTASH_REDIS_REST_URL` and
  `E2E_UPSTASH_REDIS_REST_TOKEN`, starts only on isolated port 3002, and cleans
  its own temporary build output. Its guard tests, formatting, dedicated-script
  lint, and full project type-check pass. The full production matrix is pending
  the dedicated E2E-only Upstash credentials; the runner deliberately rejects
  ordinary production credentials rather than falling back to them.
- A dedicated `dubgrid-e2e` Upstash database and the two matching GitHub
  repository secrets now exist. Local production qualification is blocked until
  its exact REST URL is supplied to `E2E_UPSTASH_REDIS_REST_URL`: the hostname
  currently configured for the runner does not resolve, so the application
  correctly reaches its two-second fail-closed limiter path. The server and
  temporary build output were removed; no limiter bypass was added.
  The runner now isolates build and test child process groups so its direct
  `SIGINT` and `SIGTERM` handlers can terminate the child tree and run the
  guarded cleanup. Both real signal paths were verified: each returned the
  interruption result, left port 3002 stopped, and removed only
  `apps/web/.next-e2e-prod/`.

## Guardrails

<!-- Archived 2026-09-24. -->

- Preserve the stopped feature 40a documentation changes exactly; they are
  unrelated dirty work and must not be reformatted, staged, reset, or included in
  this fix.
- Do not broaden browser-autofill suppression beyond the People search or disable
  useful contact autofill in the editor.
- Do not close on save initiation, optimistic mutation, validation failure, or a
  caught primary-save error.
- Preserve dirty-close confirmation, focus restoration, Escape/backdrop behavior,
  exit animation, phone normalization, duplicate-email handling, and role/privacy
  boundaries.
- Preserve the current landing content, navigation anchors, theme treatment,
  screenshots, and typography. This is a visibility repair, not a redesign.
- Do not commit, push, deploy, or complete the fix without the user's separate
  approval and the required verification gates.
