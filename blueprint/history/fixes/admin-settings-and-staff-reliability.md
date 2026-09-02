# Admin settings and staff reliability

**Type:** Fix
**Status:** verified
**Fixes:** F-18, F-19, F-20, F-21, F-22, F-23, F-24

## The problem

Organization settings can be replaced by stale production bootstrap data immediately after save. Staff editors expose incompatible role options, full staff and self-profile pages have inconsistent persistent-edit and navigation behavior, and person detail rechecks itself when auth token refresh replaces the user object. Web employee profile writes also fail to advance their optimistic-lock version or consume the authoritative returned employee, and management access has regressed to nested modal flows.

## The fix

Make settings invalidation complete before the response, filter role choices without hiding removable legacy assignments, make staff and self-profile editing persistent and permission-aware, place navigation and management access in their owning surfaces, and make employee mutation results and version conflicts authoritative. Preserve web-only organization settings, server-side role validation, self-action restrictions, mobile native navigation, and all unrelated dirty work.

## Build steps

- [x] **1. Make organization settings immediately authoritative**
  - Await organization, bootstrap-derived, and applicable slug cache invalidation before returning a settings write.
  - Audit every settings section so editable panels consume their authoritative result and read-only or independently-owned sections retain their existing lifecycle.
  - Done when an immediate post-save bootstrap request cannot return the previous organization values and focused route/settings tests pass.

- [x] **2. Repair staff role choices and employee concurrency**
  - Show eligible roles plus currently selected legacy-incompatible roles on web and mobile.
  - Atomically increment employee versions, return the updated employee, expose the latest employee on profile conflicts, and consume authoritative rows in all web callers, including self-phone and reinvitation paths.
  - Done when incompatible unselected roles are absent, legacy selections remain removable, sequential saves advance versions, and stale saves adopt the server row.

- [x] **3. Stabilize staff detail navigation and lifecycle**
  - Keep person detail resolved across same-user auth object refreshes.
  - Remove pristine no-op dismissal from persistent staff editing, move Back to People into the desktop sidebar with a mobile fallback, and render management access inside the existing slide-over or full page.
  - Keep dirty action labels concise: use `Discard`, including in unsaved-change confirmation dialogs.
  - Done when same-ID rerenders do not refetch, real identity changes do, and focused navigation/editor/access tests pass.

- [x] **4. Make own profile one persistent permission-aware editor**
  - Wait for self-profile data before seeding, open account and allowed work details in one edit session, preserve dirty drafts across refetches, and keep management access separate.
  - Retain the regular-user name-request workflow and self-role restrictions. Save profile/work data before email confirmation and report partial success precisely.
  - Apply the same persistent-edit behavior to mobile self work profile without weakening native unsaved-change protection.
  - Done when loading, permissions, dirty refetches, combined save, partial failure, and mobile persistent-edit coverage pass.

- [x] **5. Verify the complete admin reliability surface**
  - Run focused web/mobile tests, full type-check, lint, unit/integration, mobile, build, and E2E checks.
  - Exercise authenticated settings, staff, and self-profile flows when a usable session is available; report unavailable evidence as blocked.
  - Re-audit all lenses, close repaired findings only after re-review, and produce a manual try guide.
  - Done when required automated checks pass, observable criteria have honest evidence, and no in-scope P0/P1 finding remains open or fixed.

## Verify

- Save each organization settings category and confirm the new value remains visible without refresh.
- Edit staff roles on web and mobile with eligible, incompatible, and legacy-selected combinations.
- Save the same employee from sequential and stale versions and confirm authoritative version/conflict behavior.
- Leave and return to a person detail tab and confirm it does not refresh for the same signed-in user.
- Open full staff detail and My Profile, verify persistent-edit actions, sidebar navigation, inline access editing, permissions, and partial-failure copy.
- Run `npm run type-check`, `npm run lint`, `npm run test`, `npm run test:mobile`, `npm run build`, and `npm run test:e2e`.

## Findings

### admin-settings-and-staff-reliability/F-18 [P1] closed - Organization settings can refetch stale bootstrap data after save

**File:** apps/web/src/app/api/organizations/settings/route.ts:460
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, performance, tests)
**Why it matters:** Whole-organization settings writes return before invalidating the cached organization/bootstrap aggregate. The client immediately refetches bootstrap after saving, so production Redis can overwrite the optimistic value with stale data until the cache expires or the page refreshes.
**Suggested fix:** Await deletion of the organization cache key, and the old/new slug keys when applicable, before returning the authoritative organization. Add route coverage that proves invalidation completes before the response.
**Resolution:** 2026-08-31 by /implement. Whole-organization settings writes now await the organization cache deletion, which derives the aggregate bootstrap deletion, and include the slug lookup in the same awaited operation for name changes. Focused route coverage proves the response remains pending until invalidation finishes.

### admin-settings-and-staff-reliability/F-19 [P1] closed - Web employee profile optimistic locking does not advance versions

**File:** apps/web/src/app/api/employees/manage/route.ts:627-644; apps/web/src/features/employees/client/api.ts:193-238
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, security, tests)
**Why it matters:** Profile updates match an expected employee version but write the submitted row without incrementing that version. Sequential editors can therefore reuse the same token, while the client discards the authoritative returned employee and exposes a conflict type that callers do not use to adopt the latest row.
**Suggested fix:** Increment the existing version atomically, return the selected employee, expose it through one typed profile-conflict error, and make every caller replace optimistic state with the server result. Apply the same version rule to self-phone writes.
**Resolution:** 2026-09-01 by /implement. Employee profile and self-phone writes now increment and match the existing version atomically. The web client returns the authoritative employee, exposes the latest server row through EmployeeProfileConflictError, and all profile, directory, schedule-add, and reinvitation callers adopt the returned row. Focused route, client, hook, component, and type-check coverage passes.

### admin-settings-and-staff-reliability/F-20 [P1] closed - Person detail rechecks and hides itself on auth token refresh

**File:** apps/web/src/app/(app)/people/[id]/page.tsx:23-60
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, performance, tests)
**Why it matters:** The self-profile redirect effect depends on the complete Supabase user object. Returning to the tab can replace that object during token refresh, reset the resolved guard, issue another employee request, and visibly refresh the page even though the user identity did not change.
**Suggested fix:** Depend on stable user, organization, and employee identifiers and keep the resolved page visible when only the auth object instance changes. Cover same-ID and changed-ID rerenders.
**Resolution:** 2026-09-01 by /implement. The self-route effect now depends on the stable user id rather than the complete auth object. Focused rerender coverage proves a replacement object with the same id does not refetch or hide detail, while a changed user id rechecks.

### admin-settings-and-staff-reliability/F-21 [P2] closed - Staff editors render incompatible unselected roles

**File:** apps/web/src/components/EditEmployeePanel.tsx:751-782; apps/mobile/src/features/people/screens/PersonDetailScreen.tsx:1400-1418; apps/mobile/src/features/profile/screens/ProfileWorkScreen.tsx:767-785
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, tests)
**Why it matters:** Incompatible roles remain visible as disabled choices, which adds noise and exposes options the editor cannot choose. Legacy incompatible assignments still need to remain visible so they can be removed.
**Suggested fix:** Filter role choices to eligible roles plus currently selected legacy roles, keeping server validation authoritative.
**Resolution:** 2026-09-01 by /implement. Web and both mobile staff editors now filter out incompatible unselected roles while keeping selected legacy-incompatible roles visible and removable. Focused web and mobile editor coverage passes.

### admin-settings-and-staff-reliability/F-22 [P2] closed - Persistent staff page exposes no-op dismissal and misplaced navigation

**File:** apps/web/src/components/staff-detail/StaffDetailPage.tsx:756-805
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, tests)
**Why it matters:** The full staff page passes a no-op cancel callback into an editor that shows Close while pristine, and renders Back to People as a content banner instead of part of the sidebar navigation.
**Suggested fix:** Give persistent editors explicit dismissal behavior, showing Discard only for dirty drafts, and move the desktop return action into the shared sidebar with a mobile fallback.
**Resolution:** 2026-09-01 by /implement. Full-page staff editing now hides the pristine no-op Close action and exposes Discard only for dirty drafts. Back to People is a leading SettingsShell sidebar action with a compact mobile fallback, covered by focused staff-page and editor tests.

### admin-settings-and-staff-reliability/F-23 [P2] closed - Own profile seeds split editors before profile data is ready

**File:** apps/web/src/components/account/ProfilePanel.tsx:129-326; apps/web/src/app/(app)/profile/page.tsx
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, performance, tests)
**Why it matters:** Account and work details use separate read-first edit sessions, while the route does not gate editor seeding on the self-profile query state. Slow or background loads can expose blank values or replace the draft instead of presenting one persistent editor.
**Suggested fix:** Seed one permission-aware persistent editor after data is ready, preserve dirty drafts across refetches, keep management access separate, and report multi-operation partial failures accurately.
**Resolution:** 2026-09-01 by /implement. Web and mobile self-profile surfaces now wait for profile data and open directly into persistent editing. The web editor combines account/contact and permitted work fields, preserves same-identity dirty drafts, saves profile data before email confirmation, and reports later email failure as partial success; mobile retains its native unsaved-navigation guard and follows the same operation order. Focused web and mobile coverage passes.

### admin-settings-and-staff-reliability/F-24 [P2] closed - Management access regressed to nested modals

**File:** apps/web/src/components/staff/MembersSection.tsx:2094; apps/web/src/components/staff-detail/StaffDetailPage.tsx:1033
**Found:** 2026-08-31 by /audit (scope: admin settings and staff reliability; lenses: quality, tests)
**Why it matters:** People and full staff surfaces wrap the reusable access editor in a new modal, reintroducing a competing interaction path inside an existing slide-over or detail page and increasing stale membership-state risk.
**Suggested fix:** Render the shared access editor within the current slide-over or an inline full-page region and apply the returned membership timestamp before invalidating directory data.
**Resolution:** 2026-09-01 by /implement. Management access now stays inside the existing People slide-over or an inline full staff-page region. Successful access edits patch the returned membership role, permissions, and timestamp into caches before targeted invalidation; focused MembersSection and StaffDetailPage tests pass.
