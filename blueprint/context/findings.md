# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-04 [P2] open - Mobile People renders an unvirtualized full roster

**File:** apps/mobile/src/features/people/screens/PeopleScreen.tsx:761-866
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Render, layout, animation, and memory cost grow with the complete organization roster.
**Suggested fix:** Replace the roster body with a virtualized list while preserving existing behavior.
**Resolution:** Not attempted. Deferred deliberately: the roster renders inside the shared `Screen`
ScrollView (sticky-header, scroll-offset, and scrollTo machinery), so virtualizing means moving the
screen onto a FlatList with the filters and tabs as `ListHeaderComponent` and reworking
`AnimatedListItem`'s index-staggered entrance for recycled rows. That is a feature-sized change to a
shared scroll architecture and needs its own spec, not a cleanup pass.

### F-17 [P2] open - Mobile dashboard remains an explicitly reduced analytics model

**File:** packages/contracts/src/mobile.ts:583-646; apps/web/src/features/mobile/server/routes/dashboard.ts
**Found:** 2026-08-31 by /audit (scope: mobile parity; lenses: quality, performance, tests)
**Why it matters:** The mobile contract deliberately omits the web dashboard's draft-versus-published metric, detailed coverage grid, and several activity-event types. The comments document the reduction, but it is still a functional gap under the requested full parity standard.
**Suggested fix:** Align the mobile dashboard payload and screens with the web dashboard metrics and activity feed after the schedule lifecycle work establishes the required draft data.
**Resolution:**

### F-30 [P2] fixed - Most authenticated mobile queries use the rotating token as cache identity

**File:** apps/mobile/src/features/auth/hooks/useBootstrap.ts:15-50; apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx:689-709; apps/mobile/src/features/profile/screens/ProfileScreen.tsx:117-125; apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:80-81
**Found:** 2026-09-01 by /audit (scope: apps/mobile; lenses: quality, performance, tests)
**Why it matters:** Bootstrap correctly keys cached data by stable user and organization claims because Supabase rotates the token automatically and a raw-token key creates a brand-new empty cache entry. Schedule, profile, notifications, people, dashboard, requests, and other authenticated queries still embed the raw token, so normal refreshes fragment the cache, refetch mounted data, and can repaint loading states across a running app. Only bootstrap currently has a token-rotation regression test.
**Suggested fix:** Introduce a shared authenticated query identity built from stable `(sub, org_id)` claims, use it consistently in query and invalidation keys, keep the current token only inside the request function, and add token-rotation tests for representative schedule, profile, and infinite-query consumers.
**Resolution:** Fixed 2026-09-09 by feature 19c4 Steps 5-7. Authenticated mobile read keys now use stable user and organization identity while request tokens remain inside query functions; optimistic writes, unread patches, realtime invalidation, and organization switching address the stable keys and clear old-tenant data at identity boundaries. Rotation, isolation, mutation rollback and success, realtime, and switch-race tests pass. Requires `/audit` re-review before closing.

### F-31 [P2] open - Paginated mobile alerts accumulate in an unvirtualized ScrollView

**File:** apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:148-173; apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:360-378
**Found:** 2026-09-01 by /audit (scope: apps/mobile; lens: performance)
**Why it matters:** The screen correctly fetches cursor-paginated pages, but flattens every loaded page and maps all alert cards inside the shared Screen ScrollView. Each "Load more" permanently increases mounted views, animations, layout work, and memory, so long alert histories lose the performance benefit pagination should provide.
**Suggested fix:** Move the feed to FlatList or another virtualized list, place search/filter controls in its header, preserve pull-to-refresh and empty/error states, and avoid index-staggered entrance animations for recycled rows.
**Resolution:**

### F-42 [P2] open - MembersSection tests finish with unwrapped responsive updates

**File:** apps/web/src/**tests**/MembersSection.test.tsx:659-779; apps/web/src/hooks/useMediaQuery.ts:18-32
**Found:** 2026-09-02 by /audit (scope: current; lens: tests)
**Why it matters:** Eight MembersSection cases report React `act(...)` warnings
after render because the real `useMediaQuery` effect updates component state
outside the test interaction boundary. The assertions currently pass, but work
can continue after an assertion or test teardown, making this area noisy and
capable of hiding timing-dependent regressions.
**Suggested fix:** Mock `useMediaQuery` to a deterministic viewport value in the
MembersSection test harness, or await the initial responsive update inside an
`act`-aware helper before asserting. Keep separate targeted coverage for actual
media-query transitions.
**Resolution:** Re-reviewed 2026-09-02 by `/audit current`: the focused 29-test
MembersSection run still emits the same eight unwrapped-update warnings. The
test mock continues to spread the real hooks module without replacing
`useMediaQuery`, so the original timing defect remains open.

### F-45 [P2] open - Tablet user dashboard mixes a stacked shell with a desktop top grid

**File:** apps/web/src/components/dashboard/UserDashboard.tsx:363-420
**Found:** 2026-09-02 by /audit (scope: full web; lenses: quality, tests)
**Why it matters:** At 768-1024px, `stackLayout` deliberately switches the page to normal-flow tablet layout, but `topGrid` still uses a two-column hero/requests composition because only `isMobile` selects one column. This leaves the main dashboard surface at its narrowest sustained desktop layout during viewport resizes rather than the intended tablet stack. The existing unit test asserts only the desktop grid, and authenticated browser validation is currently unavailable locally.
**Suggested fix:** Use the same tablet-or-smaller condition for `topGrid` and its child placement as `stackLayout`, then add a tablet-width regression case alongside the existing desktop layout assertion.
**Resolution:**

### F-46 [P3] fixed - Three parallel button systems, two of them near-dead

**File:** apps/web/src/app/globals.css:691-720; apps/web/src/components/ui/button.tsx:8-46
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** `.dg-btn-brand` is a byte-for-byte duplicate of `.dg-btn-primary` (same background, color, border, hover, active), split 11 usages to 92 with no rule for choosing. Separately, `components/ui/button.tsx` is a full shadcn/cva variant system used by exactly two real files (`ui/sheet.tsx`, `ui/sidebar.tsx`) that redeclares every variant and size the `dg-btn` classes already provide. A contributor picks whichever they find first, which is how variant drift starts.
**Suggested fix:** Delete `.dg-btn-brand` and fold its 11 call sites into `dg-btn-primary`. Then decide `ui/button.tsx` explicitly: adopt it app-wide, or reduce it to the minimum the two shadcn primitives need and document that `dg-btn` is the app's button system.
**Resolution:** Fixed 2026-09-05. All 11 `dg-btn-brand` call sites moved to `dg-btn-primary` (zero visual change, the rules were byte-identical) and the dead `.dg-btn-brand` block was removed from `globals.css`. The user had declined the CSS deletion earlier in the session, then delegated the decision; it is trivially revertible if that was not the intent. `ui/button.tsx` remains open, and this finding mischaracterised it: it is not abandoned scaffold. `__tests__/neutral-control-chrome.test.ts` asserts its `default`, `brand`, `secondary`, `outline`, `warningFilled` and `sm` variants resolve to the same design tokens as the `dg-btn` classes, so it is a deliberately token-aligned parallel system with a contract test, even though app code only reaches for `ghost`/`icon-sm` via `ui/sheet.tsx` and `ui/sidebar.tsx`. Adopting or removing it is an architecture call, not cleanup, and trimming it would break that contract test on purpose.

### F-47 [P3] fixed - Radius values largely bypass the radius tokens

**File:** apps/web/src (338 occurrences)
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** `borderRadius` is written as a raw pixel number 338 times against 154 uses of `--dg-radius-*`, so most corners in the app are not on the scale and drift silently when the scale changes. This is independent of the inline-style question: an inline style can hold `var(--dg-radius-md)` just as easily as `8`. `fontSize` is much healthier by comparison, 200 raw against 1,117 tokenized.
**Suggested fix:** Treat it as a rule for new code plus opportunistic conversion of files already being edited, rather than a sweep. A lint rule banning numeric `borderRadius` in JSX style objects would hold the line.
**Resolution:** Fixed 2026-09-05 in ec9c7a10. Measuring the literals showed the scale was missing a step rather than being ignored: the most common value was 4px at 76 sites with no token, so `--dg-radius-xs` was added to name what already existed. 239 literals now resolve through tokens (4/6/8/10/12 to xs/sm/md/lg/xl), values identical so visually a no-op. Left raw on purpose: `999`/`9999`/`50%` are shapes not scale steps, and the off-scale one-offs (3, 5, 7, 9, 14, 16, 20) are decisions a sweep should not silently normalize. A lint rule to hold the line is still worth adding.

### F-48 [P3] fixed - Icon sources are split between lucide and hand-rolled SVG

**File:** apps/web/src (176 inline `<svg>` across 68 files; lucide-react in 54 files)
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** Some inline SVGs are legitimate (the logo, OG images, masked account-status icons, pagination chevrons), but most redraw an icon `lucide-react` already ships, each at whatever stroke width and viewBox its author chose. The result is visibly inconsistent icon weight between surfaces.
**Suggested fix:** Replace hand-rolled SVGs with the lucide equivalent when touching a file, and keep inline SVG only where it does something lucide cannot (masks, brand marks, server-rendered images).
**Resolution:** Fixed 2026-09-05 in 07bac5fd. 62 of the 176 were hand-copied lucide paths and now use the components, preserving each site's size, stroke width and colour. 176 -> 113 inline SVGs.

Worth recording: the `User` copies were a stale lucide revision (body x=4..20 against the current x=5..19), and `staff-detail/tabs/OverviewTab.tsx` already imported the real one, so the app was rendering two different user icons at once. That drift is exactly what the finding was about. The remaining 113 are masks, brand marks, OG images, and shapes lucide has no equivalent for; a first attempt at this also proved a regex transform is the wrong tool here (it inserted imports inside multi-line import blocks and truncated `style={{...}}`), so any future pass needs brace-aware parsing.

### F-49 [P3] fixed - Em dashes in user-visible copy, against the writing standard

**File:** apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:4769; apps/web/src/app/cookie-policy/CookiePreferencesManager.tsx:69; apps/web/src/components/ShiftEditPanel.tsx:3591; apps/web/src/components/AddEmployeeModal.tsx:449; apps/web/src/app/opengraph-image.tsx:4
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** `coding-standards.md` bans em dashes in generated content, and the copy tone guide bans them in user-facing strings. Roughly 375 non-comment occurrences remain, including toast text, an empty-value label ("— None —"), and the OG/Twitter card titles that appear in link previews.
**Suggested fix:** Sweep user-visible strings only (skip comments), replacing with a hyphen, comma, parentheses, or a rewrite. Leave code comments for a separate pass.
**Resolution:** Fixed 2026-09-05. Replaced 32 em dashes across user-visible strings in `apps/web` plus one in `apps/mobile` (`OrganizationLockedScreen`), using a colon, comma, or sentence split as each read best. Deliberately left: two `logger` strings (dev-facing, not user copy), code comments in the landing mockups, `scripts/*` CLI output, and the standalone `"—"` empty-value placeholder (85 sites), which is a glyph meaning "no value" rather than prose punctuation and would need its own decision to change.

### F-50 [P2] fixed - Confirm-button capitalization is split between two conventions

**File:** apps/web/src (approx. 50 `confirmLabel` values)
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** Confirm labels are split roughly evenly between Title Case ("Change Role", "Force Logout", "Extend Trial", "Turn It Off") and sentence case ("Delete organization", "Mark all read", "Enter sandbox", "Revoke and resend"). "Change Role" and "Change role" both exist in different files for the same action. The copy tone guide specifies Title Case for buttons, but the codebase has drifted toward sentence case, so the guide and the code now disagree.
**Suggested fix:** Needs a product decision first: confirm which convention wins, update the copy tone guide to match, then normalize in one sweep. Do not normalize before the decision.
**Resolution:** Fixed 2026-09-05. Decided on evidence rather than preference: multi-word UI text across the app ran 124 sentence case to 39 Title Case, so the code had already chosen, and several dialog trigger buttons were sentence case while only their confirms were Title Case. Normalized 22 label literals across 11 files to sentence case (which also resolved the `Change Role` / `Change role` duplicate), and corrected the copy tone guide, whose Title Case rule was the stale half. Four tests drove these buttons by accessible name and needed scoping to their dialog, because once a trigger and its confirm share a label `getByRole` matches both.

### F-51 [P2] fixed - 95 direct `process.env` reads against the validated-env rule

**File:** apps/web/src/app/(app)/auth/callback/route.ts:25; apps/web/src/app/(app)/auth/confirm/route.ts:25; apps/web/src/app/(app)/schedule/page.tsx:10 (95 total)
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** ESLint's `no-restricted-properties` rule says "Import validated env vars instead of reading process.env directly", and 95 sites ignore it. Standing violations mean the rule no longer catches new ones, and unvalidated reads bypass whatever the env module guarantees.
**Suggested fix:** Route the reads through the validated env module file by file, then promote the rule from warn to error so the count cannot grow.
**Resolution:** PARTIAL 2026-09-05 in 12dfc5e6, 95 to 52. Two parts were the rule catching itself: `lib/env.server.ts` and `lib/supabase-keys.ts` are the validators everything imports (now exempt, as `lib/env.ts` already was), and NODE_ENV/NEXT_RUNTIME are build discriminators the bundler inlines for dead-code elimination, so reading them off a validated object would ship dev-only code to production (the rule became a `no-restricted-syntax` selector to exempt those two names). The one real group closed was Supabase URL: `lib/supabase-keys.ts` already existed as the choke point and 20 sites bypassed it, so they now use `getSupabaseUrl()` and a new `requireSupabaseUrl()`.

The remaining 52 are blocked on a contract decision, not effort. Neither `clientEnv` nor `serverEnv` is usable at these sites: `clientEnv` is null under NODE_ENV=test by design, and `validateServerEnv()` returns null whenever `window` is defined, which it is under jsdom. Wrapping each var in a new accessor module purely to satisfy the rule would add indirection without validation, which is not what the rule is for. Decide first whether the env modules should be made test-safe, then migrate.

**Closed 2026-09-05 in 0b3946cd.** The decision was: make them test-safe. Both objects were module-level consts snapshotting process.env at import, so `vi.stubEnv` was invisible to them; 43 tests failed the moment call sites moved over. Both are now lazy, re-validated per access under test and memoised otherwise. 50 reads across 26 files migrated, rule at 0. Two latent bugs fell out: four NEXT_PUBLIC_* fields were declared in clientSchema but never passed to safeParse (so always undefined, and migrating Sentry or PostHog onto them would have silently disabled both), and `positiveEnvNumber` hand-rolled validation the schema already performed.

### F-52 [P3] fixed - 33 dead `eslint-disable` directives

**File:** apps/web/src/lib/db/schedule.ts:149; apps/web/src/components/Header.tsx:317; apps/web/src/components/QueryProvider.tsx:43 (33 total)
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: quality)
**Why it matters:** ESLint reports 33 unused disable directives (10 for `no-explicit-any`, 9 for `react-hooks/set-state-in-effect`, 7 for `no-unused-vars`, and others). Each one suppresses a rule that no longer fires there, so they hide whether the underlying issue was fixed and will silently mask a real violation if the code changes.
**Suggested fix:** `eslint --fix` removes unused directives automatically; verify the diff touches only comments.
**Resolution:** Fixed 2026-09-05 with `eslint src --fix-type directive --fix`, which by construction only edits directive comments. Count went 33 to 0.

### F-53 [P2] fixed - Typography contract test is failing on `dev`

**File:** apps/web/src/components/ScheduleGrid.tsx:3363
**Found:** 2026-09-05 by /audit (scope: apps/web; lens: tests)
**Why it matters:** `src/__tests__/typography-contract.test.ts` fails with `components/ScheduleGrid.tsx: expected 0, received 1`: a raw `fontSize: 9` introduced by commit `de79713a` ("fix(schedule): give the cell editor initials room inside the ring"). The suite has been red on `dev` since that commit, which masks any new typography regression behind an already-failing assertion.
**Suggested fix:** Either replace the raw 9 with a token, or add `ScheduleGrid.tsx` to `documentedMicroTextCounts` if 9px is deliberate for that cell-editor affordance.
**Resolution:** Fixed 2026-09-05 by documenting the exception. The 9px is deliberate and the code comment says why: two initials at badge size run wider than the 20px marker circle, so the marker sizes its text off the ring. Tokenising it would reintroduce the overflow, so `components/ScheduleGrid.tsx: 1` was added to `documentedMicroTextCounts` instead. The typography suite is green again.

### F-55 [P2] open - Delete dependency checks read every schedule cell in the org

**File:** apps/web/src/lib/db/config.ts:103-126
**Found:** 2026-09-05 by /audit (scope: full; lens: performance)
**Why it matters:** `loadActiveScheduleCellDependencies` selects every `schedule_cells` row for the org with nested `schedule_cell_snapshots` and `schedule_cell_segments`, no date filter and no count-only projection, then filters in JS. It backs the delete-dependency checks in Jobs, AbsenceTypes, and ShiftCategories settings, so answering "is this job used anywhere?" pulls a multi-MB payload for an org with a year of history. Surfaced while auditing action feedback (see [[F-54]]); those call sites do spin correctly, so this is cost rather than a missing signal.
**Suggested fix:** Replace the row fetch with a count-only query or an RPC that answers existence server-side.

### F-56 [P2] fixed - Web confirmations allow alternate dismissal while their action is pending

**File:** apps/web/src/components/ConfirmDialog.tsx:78-88; apps/web/src/components/Modal.tsx:75-95; apps/web/src/components/Header.tsx:395-403
**Found:** 2026-09-05 by /audit (scope: web and mobile confirmation/sheet surfaces; lenses: quality, tests)
**Why it matters:** ConfirmDialog disables the Cancel and confirm buttons while either action is pending, but passes onCancel directly to Modal without its onRequestClose veto. Escape, the backdrop, and the X therefore still close callers such as the sandbox exit confirmation during the request. Closing the surface does not cancel that request. Mobile ConfirmationModal already blocks its alternate dismissal paths while busy.
**Suggested fix:** Route every confirmation dismissal through the same pending-state guard, using Modal's existing veto, and cover Escape, backdrop, close icon, and Cancel during both primary and secondary requests. Preserve visible pending/error feedback until the action settles.
**Resolution:** Fixed by the user-approved confirmation-surfaces implementation: all web confirmation exits share the pending guard, the redundant X is removed, and both primary and secondary async latches remain effective even if an external loading flag is false. Regression tests cover Escape, backdrop, Cancel, and dismissal after settlement.

### F-57 [P2] fixed - Management confirmation failures render their error behind the active popup

**File:** apps/mobile/src/features/people/components/ManagementUserActionsSheet.tsx:132-173; apps/mobile/src/features/people/components/ManagementUserActionsSheet.tsx:323-355
**Found:** 2026-09-05 by /audit (scope: web and mobile confirmation/sheet surfaces; lenses: quality, tests)
**Why it matters:** Remove-access and invitation mutations retain their confirmation on failure and set the shared error state. That error is rendered in the underlying actions/access/role sheet, but neither active ConfirmationModal receives its error prop. The top native modal stops spinning without explaining the failure on its own surface.
**Suggested fix:** Pass the relevant error into the active confirmation, clear it when starting or canceling that action, and exercise rejected remove/reissue/revoke requests while asserting the message inside the visible confirmation. Preserve the existing stale-update and access safeguards.
**Resolution:** Fixed: remove-access and invitation errors render in the active ManagementUserActionsSheet confirmation and clear on cancellation/retry. Three rejected-action tests assert the error within the visible alert and its reset on reopening. PersonDetail invitation/account-link errors also remain on the active surface; handoff uses the existing transition helper. Native visual validation remains outstanding.

### F-58 [P2] fixed - Shared web Modal does not restore focus after closing

**File:** apps/web/src/components/Modal.tsx:50-73
**Found:** 2026-09-05 by /audit (scope: web and mobile confirmation/sheet surfaces; lenses: quality, tests)
**Why it matters:** Modal moves focus into itself on mount, but never captures or restores the previously focused element. Closing a confirmation over an editor removes the focused control without returning keyboard focus to the invoking action. Its tests assert initial focus only. This is inconsistent with the modal focus lifecycle described by the WAI-ARIA dialog pattern.
**Suggested fix:** Restore focus to a still-connected invoker or an intentional fallback, respecting the active modal layer. Prefer sharing the existing Base UI dialog focus/presentation infrastructure with sheets when that migration is separately scoped. Verify keyboard cancel and nested editor/confirmation flows in a browser.
**Resolution:** Fixed: Modal now uses the installed Base UI Dialog focus, modal-layer, and scroll infrastructure. An explicit returnFocus target handles disappearing menu invokers; Header uses its surviving account/menu trigger. Unit tests cover invoker restoration, fallback targets, focus trapping, and nested cancellation. Authenticated Chrome confirmed Cancel initial focus, Tab containment, Escape, menu return focus, nested editor restoration, and restoration to the page after discarding a temporary draft. No changes were saved during the browser check.

### F-59 [P2] fixed - Mobile overlay instructions contradict the current confirmation primitive

**File:** apps/mobile/AGENTS.md:195-197; apps/mobile/AGENTS.md:239-243; apps/mobile/src/shared/components/ConfirmationModal.tsx:89-100
**Found:** 2026-09-05 by /audit (scope: web and mobile confirmation/sheet surfaces; lens: quality)
**Why it matters:** Instructions mandate one modal design, forbid centered alert cards, and describe confirmation actions as vertically stacked. The current primitive intentionally renders a centered popup with a horizontal action row. Following the instructions would undo the implemented design; following the component would violate the instructions. This leaves no dependable rule for new callers.
**Suggested fix:** After the presentation policy is selected, document confirmations as brief consequence decisions, sheets as selections or bounded tasks, and pages as long workflows. Specify dismissal, pending/error ownership, action order, and explicit blocking-gate exceptions. Keep implementation and instructions aligned.
**Resolution:** Fixed: both app guides now describe consequence confirmations, task sheets, and page workflows, including pending/error ownership, action order, focus return, and explicit gate exceptions. Mobile confirmation motion and icon treatment are quieter, action layout adapts to narrow/enlarged text, status choices/reasons moved to a sheet, and ordinary profile saves no longer add a redundant confirmation.

### F-60 [P2] fixed - The modal depth guard no longer enforces its documented sheet-plus-confirmation limit

**File:** apps/mobile/src/shared/lib/modal-presentation.ts:22-23; apps/mobile/src/shared/components/BottomSheetModal.tsx:160-165; apps/mobile/src/shared/components/ConfirmationModal.tsx:89-100; apps/mobile/src/shared/components/BottomSheetModal.presentation.test.tsx:45-50
**Found:** 2026-09-05 by /audit (scope: web and mobile confirmation/sheet surfaces; lenses: quality, tests)
**Why it matters:** The limit is documented as one sheet with one confirmation above it, but only BottomSheetModal registers. After confirmations became independent native modals, two task sheets plus one or more confirmations no longer violate the counter. The test named "allows a confirmation over the sheet it guards" renders two BottomSheetModal instances, so it does not cover the current composition. This confirms a guard gap, not a reproduced native stacking failure.
**Suggested fix:** Track actual presented surfaces with their kind and owner, allow only the chosen task/confirmation composition, and test a real ConfirmationModal over a sheet. Keep handoff sequencing explicit and verify presentation/dismissal on iOS and Android; a fixed timer alone is not native transition evidence.
**Resolution:** Fixed at the presentation-policy/test layer: both real primitives register typed presentations with identity-based cleanup. Duplicate task sheets and duplicate confirmations are diagnosed; explicit required gates are separate. Regression tests render the actual ConfirmationModal above a BottomSheetModal, reject invalid compositions, and cover cleanup/handoff. This remains a diagnostic guard, not a native modal coordinator; iOS/Android transition and gesture checks remain outstanding.

### F-61 [P2] fixed - Confirmation dismissal test passes against a control name the component no longer uses

**File:** apps/mobile/src/shared/components/ConfirmationModal.test.tsx:18-39; apps/mobile/src/shared/components/ConfirmationModal.tsx:196-223
**Found:** 2026-09-05 by /audit (scope: web and mobile confirmation/sheet surfaces; lens: tests)
**Why it matters:** The test claims an explicit Cancel or Confirm is required and only checks that "Dismiss confirmation" is absent. The component actually renders a backdrop button labeled "Dismiss" and calls onCancel from it when idle. The passing assertion therefore proves neither the claimed policy nor the real backdrop/back-button behavior.
**Suggested fix:** Set the intended policy explicitly, test the actual dismissal controls and Android onRequestClose while idle and pending, and assert that dismiss never invokes the consequential action. Keep the native presentation test separate from jsdom shims.
**Resolution:** Fixed: tests use the real Dismiss control and capture React Native Modal onRequestClose. Idle dismissal calls Cancel without invoking the action; pending backdrop, Cancel, Android back, and duplicate confirmation are covered. These are component tests with native shims, not device evidence.

Audit validation for F-56 through F-61: focused quality/tests review of current dev checkout, including pre-existing uncommitted UI changes. Source inventory found 28 mobile ConfirmationModal uses, 17 mobile BottomSheetModal uses, and 79 web ConfirmDialog uses; counts exclude comments and tests. Reviewed shared primitives, dismissal/drag/handoff guards, and representative People, profile/session, request, filter, navigation, and change-review consumers. Dependency/generated/build output and backend security/performance were outside scope. This was not an exhaustive runtime audit of every caller.

Commands: `npx vitest run --config apps/web/vitest.config.mts apps/web/src/__tests__/ConfirmDialog.test.tsx apps/web/src/__tests__/Modal.test.tsx apps/web/src/__tests__/useUnsavedChangesPrompt.test.tsx` collected the two existing suites, 18 passed. `npx vitest run --config apps/mobile/vitest.config.mts apps/mobile/src/shared/components/ConfirmationModal.test.tsx apps/mobile/src/shared/components/BottomSheetModal.presentation.test.tsx apps/mobile/src/shared/hooks/useUnsavedChangesGuard.test.tsx apps/mobile/src/shared/hooks/useModalHandoff.test.tsx apps/mobile/src/features/profile/screens/ProfileSessionsScreen.test.tsx` collected three existing suites, 15 passed. The guard test actually has a `.test.ts` extension and was then run with `npx vitest run --config apps/mobile/vitest.config.mts apps/mobile/src/shared/hooks/useUnsavedChangesGuard.test.ts apps/mobile/src/shared/hooks/useSheetDragToDismiss.test.ts`, 25 passed. Total: 58 passed. The mobile session suite emits DOM-shim warnings for overScrollMode and onContentSizeChange. No skipped/focused test declarations found in these seven suites. No full suite, build, typecheck, authenticated browser, VoiceOver/TalkBack, keyboard-layout, or native gesture/presentation validation was performed. No prior findings were closed.

### F-65 [P2] fixed - Sticky date row's ARIA rows and column headers have no owning grid

**File:** apps/web/src/components/ScheduleGrid.tsx:1336-1346; apps/web/src/components/ScheduleGrid.tsx:1495-1510
**Found:** 2026-09-07 by /audit (scope: changed; lens: quality)
**Why it matters:** Moving the date row out of the body's horizontal scroller (required for native `position: sticky`) left its `role="row"` and `role="columnheader"` cells under a `role="presentation"` wrapper with no `grid` ancestor, while the body `role="grid"` now contains rows but no column headers. Screen readers lose the day-to-column association the grid had before this change, and the ARIA ownership is invalid.
**Suggested fix:** Make the section wrapper the `role="grid"` with the section's `aria-label`, and mark the header and body containers `role="rowgroup"` (generic wrappers between them are transparent to the accessibility tree). Update the two tests that resolve the body scroller from `getByRole("grid")`.
**Resolution:** Repaired 2026-09-07 in the same session: the section wrapper is now the `role="grid"` with the section label, and the header and body containers are `role="rowgroup"`. A grid test asserts one grid owns both rowgroups.

### F-66 [P3] fixed - Search scroll margin hard-codes the sticky group's height

**File:** apps/web/src/components/ScheduleGrid.tsx (employee row `scrollMarginTop`, `+ 80px`)
**Found:** 2026-09-07 by /audit (scope: changed; lens: quality)
**Why it matters:** The `80px` stands in for the label plus date-row height. At larger font settings or if the cap gains chrome, a searched-to row lands partly under the sticky group; nothing fails loudly.
**Suggested fix:** Publish the measured group height as a CSS custom property from the existing geometry effect (it already measures the grid) and use it in the calc, or accept the constant and name it beside `CHIP_OVERHANG_PX`.
**Resolution:** Repaired 2026-09-07 in the same session: the geometry effect publishes `--dg-grid-sticky-height` on the section and the row scroll margin reads it, keeping `80px` only as the fallback.

### F-67 [P3] open - Read-only shift detail panel is announced as "Edit shift"

**File:** apps/web/src/components/ShiftEditPanel.tsx:3430-3433
**Found:** 2026-09-17 by feature 25d2b Step 3 (role variance, `qa-regular` and `qa-management`)
**Why it matters:** When a viewer without edit rights opens their own cell, `ShiftEditPanel` renders in detail mode (`allowShiftEdits` false) but keeps the static `aria-label="Edit shift"`, so a screen reader announces a read-only panel as an editor. The request-only return block already labels itself "Shift requests"; only this branch is mislabeled. `e2e/role-variance.spec.ts` matches the panel on its rendered content for that reason.
**Suggested fix:** Derive the dialog label from the mode (for example "Shift details" when `!allowShiftEdits`), then let the role-variance test assert the accessible name.
**Resolution:**

### F-68 [P3] open - Shell renders nothing while the organization bootstrap retries a 5xx

**File:** apps/web/src/features/organization/client/api.ts:125-144; apps/web/src/components/onboarding/OnboardingGate.tsx:237-254; apps/web/src/components/SetupGuard.tsx:43-44
**Found:** 2026-09-17 by feature 25d2b Step 5 (role variance, bootstrap states)
**Why it matters:** A 5xx from `/api/organization/bootstrap` is retried up to three times with jittered backoff (worst case about 7s) before the query errors and `OrganizationBootstrapRecovery` appears. During that window `SetupGuard` returns null and no page-level progress bar is mounted, so every role sees a blank shell with no header and no loading affordance. The role-variance probe measured 4-5s of empty `body` on Firefox before the recovery copy rendered. Role-independent, so not a 25d2b contract violation.
**Suggested fix:** Keep a loading affordance mounted while the bootstrap query is retrying (the shared progress bar above `SetupGuard`, or `AuthTransitionScreen` with its workspace phase), so a transient failure never reads as a hung page.
**Resolution:**

### F-69 [P3] open - Impersonation end accepts any reason, then answers a constraint violation with a 500

**File:** apps/web/src/app/api/gridmaster/impersonation/route.ts:23-28,153-165; supabase/migrations/002_functions_triggers.sql (end_impersonation)
**Found:** 2026-09-17 by feature 25d2c Step 4 (role variance, impersonation)
**Why it matters:** `endSchema` validates `reason` as any non-empty string, but `impersonation_sessions.end_reason` is constrained to `manual | expired | navigation`. Any other value reaches the RPC, fails the check constraint, and the catch-all turns it into a generic 500 "We couldn't update that viewing session. Try again." The caller cannot tell it sent an invalid value. Reproduced by calling `end_impersonation(<own session>, 'probe')` as `qa-gridmaster` in a rolled-back transaction: `violates check constraint "impersonation_sessions_end_reason_check"`.
**Suggested fix:** `reason: z.enum(["manual", "expired", "navigation"]).optional()` in `endSchema`, so an unknown value is a 400 `INVALID_INPUT` before the RPC.
**Resolution:**

### F-70 [P3] open - Starting an impersonation while one is active loses the RPC's message behind a 500

**File:** apps/web/src/app/api/gridmaster/impersonation/route.ts:114-131,184-193; apps/web/src/components/gridmaster/EnhancedImpersonation.tsx:119-165
**Found:** 2026-09-17 by feature 25d2c Step 4 (role variance, impersonation)
**Why it matters:** `start_impersonation` raises "Cannot start a new impersonation while another session is active. End the current session first." The route's catch-all maps that to the same generic 500 as any unexpected failure, and the Start confirmation dialog stays open with only a transient toast, so a gridmaster with a stale session (for example after closing the tab without "End Session") sees an apparent outage instead of the instruction to end the previous session. Observed on Firefox/WebKit in the e2e run when Chromium's session was still open: POST answered 500 in 0.1s.
**Suggested fix:** Recognise the known RPC errors (active session, self-impersonation, membership mismatch) and return 409/400 with the RPC message; let the dialog show it. Consider offering "End previous session" inline.
**Resolution:**

### F-71 [P3] open - Impersonation banner names the target while the shell greets the gridmaster

**File:** apps/web/src/components/ImpersonationBanner.tsx:114; apps/web/src/components/dashboard/UserDashboard.tsx (greeting and "No linked staff profile" state); docs/authentication.md:416
**Found:** 2026-09-17 by feature 25d2c Step 5 (role variance, impersonation)
**Why it matters:** Impersonation is role-scoped by design: the proxy verifies the target's membership, organization and role, while the gridmaster's own JWT keeps acting. The banner says "Impersonating qa-regular@dubgrid.test", but the dashboard beneath it says "Glad you're here, qa-gridmaster!" and "No linked staff profile", the schedule has no own row, and the profile has no Overview. A support engineer reading the banner expects to see what the target sees and instead sees the target's permission set around their own identity, with no copy explaining the difference.
**Suggested fix:** Say what it is: "Viewing Calm Haven as user (qa-regular@dubgrid.test)" in the banner, and suppress or reword the personal greeting and no-linked-profile state while impersonating. Widening impersonation to act as the target would be a security design change, not a copy fix.
**Resolution:**

### F-72 [P3] open - The /gridmaster safety escape clears the cookie but leaves the impersonation row active

**File:** apps/web/src/proxy.ts:441-446; supabase/migrations/002_functions_triggers.sql (start_impersonation active-session check)
**Found:** 2026-09-17 by feature 25d2c Step 5 (role variance, impersonation)
**Why it matters:** Navigating to /gridmaster while impersonating clears `dubgrid-impersonation` server-side, so the portal renders and the banner is gone, but no `end_impersonation` call is made. The `impersonation_sessions` row stays active until its 30-minute expiry, the Security view keeps counting it, and `start_impersonation` refuses a new session for that gridmaster until then (surfaced as the generic 500 in [[F-70]]). The e2e spec ends the row through the API after taking the escape for that reason.
**Suggested fix:** Have the escape end the session too: either the proxy calls `end_impersonation` with reason `navigation` (the constraint already allows it), or the portal ends any open session for the signed-in gridmaster on mount.
**Resolution:**

### F-73 [P2] open - Ending impersonation sometimes bounces the gridmaster to /login on Firefox

**File:** apps/web/src/components/ImpersonationBanner.tsx:65-92; apps/web/src/components/AuthProvider.tsx:117-123; apps/web/src/components/RouteGuards.tsx:47-59
**Found:** 2026-09-17 by feature 25d2c Step 5 (role variance, impersonation)
**Why it matters:** After "End Session" the banner ends the DB session (POST answers 200), clears the cookie, clears the query cache and replaces the location with /dashboard. In roughly 1 of 7 cycles on Firefox (never yet on Chromium or WebKit) the page instead issues a direct document GET of /login with the Supabase auth cookie still present, and the portal login renders empty for a still-signed-in gridmaster. A probe captured the sequence twice: End POST 200, one console error with an object argument, then `DOC 200 GET /login` with no /dashboard document and no 3xx, so the navigation is client-initiated. The best-supported reading is that an auth event without an access token reaches AuthProvider (line 120 commits a null user) and ProtectedRoute's sign-out branch replaces the location with /login before the banner's own navigation wins; the emitter was not confirmed because the run that serialized the error's arguments did not reproduce it.
**Suggested fix:** Reproduce with the auth listener instrumented (log every event and whether `nextSession.access_token` is set) around handleEnd; likely mitigations are navigating before `queryClient.clear()`, or having ProtectedRoute ignore a transient null session while an impersonation end is in flight. `e2e/role-variance-impersonation.spec.ts` currently accepts the bounce (annotated) so the suite stays deterministic; make the portal landing strict again once fixed.
**Resolution:**

### F-74 [P3] open - The Gridmaster route's not-found boundary is unreachable

**File:** apps/web/src/app/(app)/gridmaster/not-found.tsx; apps/web/src/app/(app)/gridmaster/page.tsx
**Found:** 2026-09-17 by feature 25d3 Step 5 (Gridmaster portal states)
**Why it matters:** The route ships a tailored boundary ("The Gridmaster page you're looking for doesn't exist.", "Back to Gridmaster"), but nothing under `/gridmaster` calls `notFound()` and the segment has no dynamic child, so an unknown path such as `/gridmaster/does-not-exist` never enters it. Next answers with the app root's 404 ("This page could not be found.", "Go Home"), which sends a gridmaster to the org apex instead of back to the portal. The file is dead code with copy nobody sees. Same shape as the resolved `/settings` claim in 25d1c2.
**Suggested fix:** Either give the portal a catch-all child that calls `notFound()` so the route-local boundary answers unknown portal paths, or delete the file and let the manifest stop claiming a route-local not-found state.
**Resolution:**

### F-75 [P2] fixed - Equivalent number badges switch between circles and pills

**File:** apps/web/src/components/ui/numeric-badge.tsx:26-31; apps/web/src/app/globals.css:3825-3838; apps/mobile/src/features/schedule/screens/scheduleScreenStyles.ts:875-889
**Found:** 2026-09-18 by /audit (scope: number-pill consistency across web and mobile; lens: quality)
**Why it matters:** The shared web `NumericBadge` deliberately renders one- and two-character values as fixed circles and only widens values longer than two characters. The same semantic counts rendered through `.dg-notification-badge` and the mobile open-shift, alert, segmented-control, and tab-strip badges are pills for every value. As a result, identical two-digit counts such as 26 or 50 change shape depending on the surface, creating visible UI drift and different text-scaling/overflow behavior.
**Suggested fix:** Make numeric count indicators use one explicit pill contract across platforms (minimum width, horizontal padding, height, tabular numerals, color variants, overflow, and accessible value). Remove the digit-length shape switch, route web call sites through the shared primitive, and align mobile count badges with the same contract. Add regression and screenshot coverage for 1, 2, 9, 10, 26, 50, 99, 99+, and 100 in light/dark themes and supported text scales. Preserve circles only for non-numeric icon/status badges.
**Resolution:** Fixed 2026-09-18 by feature 23a. One `NumericBadge` per platform reads a shared size, clamp, and tabular-numeral contract from `@dubgrid/design-tokens`; the web digit-length circle switch, `.dg-notification-badge`, the alerts tab's inline circle, and the mobile fixed 22pt filter circle, bordered open-shift badge, and per-file badge styles are gone. Qualified by `e2e/numeric-badges.spec.ts` (1 to 99+ in light/dark at 100%/200% on three browsers) and ten mobile cells in `blueprint/reference/mobile/`. Requires `/audit` re-review before closing.
