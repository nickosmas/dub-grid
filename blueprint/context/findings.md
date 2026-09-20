# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-04 [P2] fixed - Mobile People renders an unvirtualized full roster

**File:** apps/mobile/src/features/people/screens/PeopleScreen.tsx:761-866
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Render, layout, animation, and memory cost grow with the complete organization roster.
**Suggested fix:** Replace the roster body with a virtualized list while preserving existing behavior.
**Resolution:** Not attempted. Deferred deliberately: the roster renders inside the shared `Screen` Fixed 2026-09-20. `Screen` gained a `list` mode that swaps its scroll view for a `FlatList` while keeping the sticky header, pull-to-refresh, bottom padding, iOS insets and the scroll handle; `children` become the list header. The People roster (both tabs) renders through it, so only rows near the viewport mount; the index-staggered entrance is dropped for recycled rows. Screen list-mode tests (order, separators, footer, refresh control, scroll handle, empty-state fill) and the People suites pass; simulator check after the fast-forward. Requires `/audit` re-review before closing.
ScrollView (sticky-header, scroll-offset, and scrollTo machinery), so virtualizing means moving the
screen onto a FlatList with the filters and tabs as `ListHeaderComponent` and reworking
`AnimatedListItem`'s index-staggered entrance for recycled rows. That is a feature-sized change to a
shared scroll architecture and needs its own spec, not a cleanup pass.

### F-17 [P2] fixed - Mobile dashboard remains an explicitly reduced analytics model

**File:** packages/contracts/src/mobile.ts:583-646; apps/web/src/features/mobile/server/routes/dashboard.ts
**Found:** 2026-08-31 by /audit (scope: mobile parity; lenses: quality, performance, tests)
**Why it matters:** The mobile contract deliberately omits the web dashboard's draft-versus-published metric, detailed coverage grid, and several activity-event types. The comments document the reduction, but it is still a functional gap under the requested full parity standard.
**Suggested fix:** Align the mobile dashboard payload and screens with the web dashboard metrics and activity feed after the schedule lifecycle work establishes the required draft data.
**Resolution:** Fixed 2026-09-20. Two of the three cited gaps were already closed by 18b/18c (`draftSummary` and the four activity types). The remaining one, the per-day required-vs-filled grid, now ships: `summarizeCoverageDailyForFocusArea` in `@dubgrid/schedule-core` (same arithmetic as web's expanded coverage), threaded through `fetchMobileCoverageSummary` and `buildCoverageSectionsResponse` into `coverageBySection[].daily`, and rendered as a fixed-size day strip under each section row on the mobile coverage screen. Tests at each layer. Requires `/audit` re-review before closing.

### F-30 [P2] fixed - Most authenticated mobile queries use the rotating token as cache identity

**File:** apps/mobile/src/features/auth/hooks/useBootstrap.ts:15-50; apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx:689-709; apps/mobile/src/features/profile/screens/ProfileScreen.tsx:117-125; apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:80-81
**Found:** 2026-09-01 by /audit (scope: apps/mobile; lenses: quality, performance, tests)
**Why it matters:** Bootstrap correctly keys cached data by stable user and organization claims because Supabase rotates the token automatically and a raw-token key creates a brand-new empty cache entry. Schedule, profile, notifications, people, dashboard, requests, and other authenticated queries still embed the raw token, so normal refreshes fragment the cache, refetch mounted data, and can repaint loading states across a running app. Only bootstrap currently has a token-rotation regression test.
**Suggested fix:** Introduce a shared authenticated query identity built from stable `(sub, org_id)` claims, use it consistently in query and invalidation keys, keep the current token only inside the request function, and add token-rotation tests for representative schedule, profile, and infinite-query consumers.
**Resolution:** Fixed 2026-09-09 by feature 19c4 Steps 5-7. Authenticated mobile read keys now use stable user and organization identity while request tokens remain inside query functions; optimistic writes, unread patches, realtime invalidation, and organization switching address the stable keys and clear old-tenant data at identity boundaries. Rotation, isolation, mutation rollback and success, realtime, and switch-race tests pass. Requires `/audit` re-review before closing.

### F-31 [P2] fixed - Paginated mobile alerts accumulate in an unvirtualized ScrollView

**File:** apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:148-173; apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:360-378
**Found:** 2026-09-01 by /audit (scope: apps/mobile; lens: performance)
**Why it matters:** The screen correctly fetches cursor-paginated pages, but flattens every loaded page and maps all alert cards inside the shared Screen ScrollView. Each "Load more" permanently increases mounted views, animations, layout work, and memory, so long alert histories lose the performance benefit pagination should provide.
**Suggested fix:** Move the feed to FlatList or another virtualized list, place search/filter controls in its header, preserve pull-to-refresh and empty/error states, and avoid index-staggered entrance animations for recycled rows.
**Resolution:** Fixed 2026-09-20. Alerts render through `Screen`'s new `list` mode: search, filter strip and unread row stay as the header, rows mount only near the viewport, "Load more" is the list footer, and the hairline separators and gutter bleed are unchanged. Requires `/audit` re-review before closing.

### F-42 [P2] fixed - MembersSection tests finish with unwrapped responsive updates

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
**Resolution:** Re-reviewed 2026-09-02 by `/audit current`: the focused 29-test Fixed 2026-09-20. The source was not `useMediaQuery` (its layout effect runs inside render's act, and matchMedia is stubbed synchronously) but the managing viewer's `fetchOrganizationInvitations` promise committing `pendingInvitations` after the eight synchronous tests had returned. Those tests now await an act-wrapped microtask flush (`settleInvitations`) before asserting: 31 pass, 0 act warnings (was 8). Requires `/audit` re-review before closing.
MembersSection run still emits the same eight unwrapped-update warnings. The
test mock continues to spread the real hooks module without replacing
`useMediaQuery`, so the original timing defect remains open.

### F-45 [P2] fixed - Tablet user dashboard mixes a stacked shell with a desktop top grid

**File:** apps/web/src/components/dashboard/UserDashboard.tsx:363-420
**Found:** 2026-09-02 by /audit (scope: full web; lenses: quality, tests)
**Why it matters:** At 768-1024px, `stackLayout` deliberately switches the page to normal-flow tablet layout, but `topGrid` still uses a two-column hero/requests composition because only `isMobile` selects one column. This leaves the main dashboard surface at its narrowest sustained desktop layout during viewport resizes rather than the intended tablet stack. The existing unit test asserts only the desktop grid, and authenticated browser validation is currently unavailable locally.
**Suggested fix:** Use the same tablet-or-smaller condition for `topGrid` and its child placement as `stackLayout`, then add a tablet-width regression case alongside the existing desktop layout assertion.
**Resolution:** Fixed 2026-09-20. The top grid, hero shell, cover requests and available shifts all key their columns and placement off `stackLayout` (mobile or tablet) instead of `isMobile`; the hero stops stretching in the stack. New test asserts a single column and no row span at tablet width. Requires `/audit` re-review before closing.

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

### F-55 [P2] fixed - Delete dependency checks read every schedule cell in the org

**File:** apps/web/src/lib/db/config.ts:103-126
**Found:** 2026-09-05 by /audit (scope: full; lens: performance)
**Why it matters:** `loadActiveScheduleCellDependencies` selects every `schedule_cells` row for the org with nested `schedule_cell_snapshots` and `schedule_cell_segments`, no date filter and no count-only projection, then filters in JS. It backs the delete-dependency checks in Jobs, AbsenceTypes, and ShiftCategories settings, so answering "is this job used anywhere?" pulls a multi-MB payload for an org with a year of history. Surfaced while auditing action feedback (see [[F-54]]); those call sites do spin correctly, so this is cost rather than a missing signal.
**Suggested fix:** Replace the row fetch with a count-only query or an RPC that answers existence server-side.
**Resolution:** Fixed 2026-09-20. Migration 025 adds `count_schedule_cell_usage(org, shift, job, absence_type)` (service-role only, counts distinct cells of unarchived employees), and the settings route's job, shift-category and absence-type checks call it instead of loading every cell; the "referenced anywhere" checks became head counts on `schedule_cell_segments` / `schedule_cell_snapshots`, which carry `org_id`. Dry run against the local seed: RPC and the old in-memory count agree (171/184/176) for three organizations. The dead browser-side copies in `lib/db/config.ts` and their test were removed. Route test asserts the RPC is used and `schedule_cells` is never read. Requires `/audit` re-review before closing.

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

### F-67 [P3] fixed - Read-only shift detail panel is announced as "Edit shift"

**File:** apps/web/src/components/ShiftEditPanel.tsx:3430-3433
**Found:** 2026-09-17 by feature 25d2b Step 3 (role variance, `qa-regular` and `qa-management`)
**Why it matters:** When a viewer without edit rights opens their own cell, `ShiftEditPanel` renders in detail mode (`allowShiftEdits` false) but keeps the static `aria-label="Edit shift"`, so a screen reader announces a read-only panel as an editor. The request-only return block already labels itself "Shift requests"; only this branch is mislabeled. `e2e/role-variance.spec.ts` matches the panel on its rendered content for that reason.
**Suggested fix:** Derive the dialog label from the mode (for example "Shift details" when `!allowShiftEdits`), then let the role-variance test assert the accessible name.
**Resolution:** Fixed 2026-09-20. The dialog label is `allowShiftEdits ? "Edit shift" : "Shift details"`; unit test covers both, and `e2e/role-variance.spec.ts` now matches the read-only panel by its accessible name. Requires `/audit` re-review before closing.

### F-68 [P3] fixed - Shell renders nothing while the organization bootstrap retries a 5xx

**File:** apps/web/src/features/organization/client/api.ts:125-144; apps/web/src/components/onboarding/OnboardingGate.tsx:237-254; apps/web/src/components/SetupGuard.tsx:43-44
**Found:** 2026-09-17 by feature 25d2b Step 5 (role variance, bootstrap states)
**Why it matters:** A 5xx from `/api/organization/bootstrap` is retried up to three times with jittered backoff (worst case about 7s) before the query errors and `OrganizationBootstrapRecovery` appears. During that window `SetupGuard` returns null and no page-level progress bar is mounted, so every role sees a blank shell with no header and no loading affordance. The role-variance probe measured 4-5s of empty `body` on Firefox before the recovery copy rendered. Role-independent, so not a 25d2b contract violation.
**Suggested fix:** Keep a loading affordance mounted while the bootstrap query is retrying (the shared progress bar above `SetupGuard`, or `AuthTransitionScreen` with its workspace phase), so a transient failure never reads as a hung page.
**Resolution:** Fixed 2026-09-20. `SetupGuard` renders `AuthTransitionScreen` (workspace phase) instead of `null` while the bootstrap is loading with nothing cached, so a retrying 5xx shows progress rather than an empty shell; new `SetupGuard.test.tsx`. Requires `/audit` re-review before closing.

### F-69 [P3] fixed - Impersonation end accepts any reason, then answers a constraint violation with a 500

**File:** apps/web/src/app/api/gridmaster/impersonation/route.ts:23-28,153-165; supabase/migrations/002_functions_triggers.sql (end_impersonation)
**Found:** 2026-09-17 by feature 25d2c Step 4 (role variance, impersonation)
**Why it matters:** `endSchema` validates `reason` as any non-empty string, but `impersonation_sessions.end_reason` is constrained to `manual | expired | navigation`. Any other value reaches the RPC, fails the check constraint, and the catch-all turns it into a generic 500 "We couldn't update that viewing session. Try again." The caller cannot tell it sent an invalid value. Reproduced by calling `end_impersonation(<own session>, 'probe')` as `qa-gridmaster` in a rolled-back transaction: `violates check constraint "impersonation_sessions_end_reason_check"`.
**Suggested fix:** `reason: z.enum(["manual", "expired", "navigation"]).optional()` in `endSchema`, so an unknown value is a 400 `INVALID_INPUT` before the RPC.
**Resolution:** Fixed 2026-09-20. `endSchema.reason` is `z.enum(["manual", "expired", "navigation"])`, so an unknown value is a 400 before the RPC; route test covers `probe` (400, no RPC) and `navigation` (200). Requires `/audit` re-review before closing.

### F-70 [P3] fixed - Starting an impersonation while one is active loses the RPC's message behind a 500

**File:** apps/web/src/app/api/gridmaster/impersonation/route.ts:114-131,184-193; apps/web/src/components/gridmaster/EnhancedImpersonation.tsx:119-165
**Found:** 2026-09-17 by feature 25d2c Step 4 (role variance, impersonation)
**Why it matters:** `start_impersonation` raises "Cannot start a new impersonation while another session is active. End the current session first." The route's catch-all maps that to the same generic 500 as any unexpected failure, and the Start confirmation dialog stays open with only a transient toast, so a gridmaster with a stale session (for example after closing the tab without "End Session") sees an apparent outage instead of the instruction to end the previous session. Observed on Firefox/WebKit in the e2e run when Chromium's session was still open: POST answered 500 in 0.1s.
**Suggested fix:** Recognise the known RPC errors (active session, self-impersonation, membership mismatch) and return 409/400 with the RPC message; let the dialog show it. Consider offering "End previous session" inline.
**Resolution:** Fixed 2026-09-20. The start branch recognises the RPC's caller-mistake messages (active session, self-impersonation, org mismatch, unknown target, justification length) and answers 409/400 with the RPC message, which the portal toast already shows via `formatClientErrorMessage`. Route test asserts the active-session case is 409 with the message and no audit row. Requires `/audit` re-review before closing.

### F-71 [P3] fixed - Impersonation banner names the target while the shell greets the gridmaster

**File:** apps/web/src/components/ImpersonationBanner.tsx:114; apps/web/src/components/dashboard/UserDashboard.tsx (greeting and "No linked staff profile" state); docs/authentication.md:416
**Found:** 2026-09-17 by feature 25d2c Step 5 (role variance, impersonation)
**Why it matters:** Impersonation is role-scoped by design: the proxy verifies the target's membership, organization and role, while the gridmaster's own JWT keeps acting. The banner says "Impersonating qa-regular@dubgrid.test", but the dashboard beneath it says "Glad you're here, qa-gridmaster!" and "No linked staff profile", the schedule has no own row, and the profile has no Overview. A support engineer reading the banner expects to see what the target sees and instead sees the target's permission set around their own identity, with no copy explaining the difference.
**Suggested fix:** Say what it is: "Viewing Calm Haven as user (qa-regular@dubgrid.test)" in the banner, and suppress or reword the personal greeting and no-linked-profile state while impersonating. Widening impersonation to act as the target would be a security design change, not a copy fix.
**Resolution:** Fixed 2026-09-20. Banner reads "Viewing <org> as <role> (<email>)"; the dashboard greeting drops the personal name while `permissions.isImpersonating`, and UserDashboard's unlinked card explains that impersonation applies the member's access to the gridmaster's own account instead of "No linked staff profile". e2e spec updated to the new copy. Requires `/audit` re-review before closing.

### F-72 [P3] fixed - The /gridmaster safety escape clears the cookie but leaves the impersonation row active

**File:** apps/web/src/proxy.ts:441-446; supabase/migrations/002_functions_triggers.sql (start_impersonation active-session check)
**Found:** 2026-09-17 by feature 25d2c Step 5 (role variance, impersonation)
**Why it matters:** Navigating to /gridmaster while impersonating clears `dubgrid-impersonation` server-side, so the portal renders and the banner is gone, but no `end_impersonation` call is made. The `impersonation_sessions` row stays active until its 30-minute expiry, the Security view keeps counting it, and `start_impersonation` refuses a new session for that gridmaster until then (surfaced as the generic 500 in [[F-70]]). The e2e spec ends the row through the API after taking the escape for that reason.
**Suggested fix:** Have the escape end the session too: either the proxy calls `end_impersonation` with reason `navigation` (the constraint already allows it), or the portal ends any open session for the signed-in gridmaster on mount.
**Resolution:** Fixed 2026-09-20. The proxy escape now calls `end_impersonation(sessionId, 'navigation')` as the gridmaster (new `endImpersonationOnEscape`, unit-tested) alongside clearing the cookie. The e2e escape test asserts the row is ended with reason `navigation` (Chromium pass). Requires `/audit` re-review before closing.

### F-73 [P2] fixed - Ending impersonation sometimes bounces the gridmaster to /login on Firefox

**File:** apps/web/src/components/ImpersonationBanner.tsx:65-92; apps/web/src/components/AuthProvider.tsx:117-123; apps/web/src/components/RouteGuards.tsx:47-59
**Found:** 2026-09-17 by feature 25d2c Step 5 (role variance, impersonation)
**Why it matters:** After "End Session" the banner ends the DB session (POST answers 200), clears the cookie, clears the query cache and replaces the location with /dashboard. In roughly 1 of 7 cycles on Firefox (never yet on Chromium or WebKit) the page instead issues a direct document GET of /login with the Supabase auth cookie still present, and the portal login renders empty for a still-signed-in gridmaster. A probe captured the sequence twice: End POST 200, one console error with an object argument, then `DOC 200 GET /login` with no /dashboard document and no 3xx, so the navigation is client-initiated. The best-supported reading is that an auth event without an access token reaches AuthProvider (line 120 commits a null user) and ProtectedRoute's sign-out branch replaces the location with /login before the banner's own navigation wins; the emitter was not confirmed because the run that serialized the error's arguments did not reproduce it.
**Suggested fix:** Reproduce with the auth listener instrumented (log every event and whether `nextSession.access_token` is set) around handleEnd; likely mitigations are navigating before `queryClient.clear()`, or having ProtectedRoute ignore a transient null session while an impersonation end is in flight. `e2e/role-variance-impersonation.spec.ts` currently accepts the bounce (annotated) so the suite stays deterministic; make the portal landing strict again once fixed.
**Resolution:** Fixed 2026-09-20 on the finding's best-supported reading: the banner (End Session and expiry) and the portal start flow now call `markAuthTransition()` before any teardown, so ProtectedRoute holds instead of bouncing when a transient null session reaches it; `queryClient.clear()` stays, moved to directly before the document replace, because the tenant-boundary contract test requires prior-tenant client state to be discarded at that point. The e2e End Session test asserts the `/dashboard` landing strictly again; nine Firefox End Session cycles on the main checkout's Turbopack server (3 in the full spec, 6 repeats) plus 3 WebKit and 3 Chromium landed on the portal every time. Requires `/audit` re-review before closing.

### F-74 [P3] fixed - The Gridmaster route's not-found boundary is unreachable

**File:** apps/web/src/app/(app)/gridmaster/not-found.tsx; apps/web/src/app/(app)/gridmaster/page.tsx
**Found:** 2026-09-17 by feature 25d3 Step 5 (Gridmaster portal states)
**Why it matters:** The route ships a tailored boundary ("The Gridmaster page you're looking for doesn't exist.", "Back to Gridmaster"), but nothing under `/gridmaster` calls `notFound()` and the segment has no dynamic child, so an unknown path such as `/gridmaster/does-not-exist` never enters it. Next answers with the app root's 404 ("This page could not be found.", "Go Home"), which sends a gridmaster to the org apex instead of back to the portal. The file is dead code with copy nobody sees. Same shape as the resolved `/settings` claim in 25d1c2.
**Suggested fix:** Either give the portal a catch-all child that calls `notFound()` so the route-local boundary answers unknown portal paths, or delete the file and let the manifest stop claiming a route-local not-found state.
**Resolution:** Fixed 2026-09-20 by deleting `(app)/gridmaster/not-found.tsx`: nothing under the segment calls `notFound()` and the standards forbid a catch-all child, so the boundary could never render. Requires `/audit` re-review before closing.

### F-77 [P2] fixed - A request sheet opened during another sheet's dismissal is dropped by UIKit and stays "open" in JS

**File:** apps/mobile/src/features/schedule/screens/ShiftDetailScreen.tsx:1606; apps/mobile/src/features/schedule/screens/ShiftDetailScreen.tsx:1918
**Found:** 2026-09-19 by /audit (scope: 87c22a64..7a2f6c76; lens: quality)
**Why it matters:** Once during the audit, tapping Swap after closing the "Publication details" sheet on the same screen did nothing, and the device log recorded `Attempt to present <RCTFabricModalHostViewController> ... which is already presenting <RCTFabricModalHostViewController>` (10:47:42). JS had set `requestMode = "swap"`, so a second tap was a no-op and the button stayed dead until the screen was left. The unrelated sheets on this screen (publication, previous shift, swap, coverage) are not sequenced through `useModalHandoff`, so a tap inside the previous sheet's dismissal window can hit this. Three deliberate reproductions (X close, backdrop close, close after dismissing the dev toast) did not trigger it again, so the exact window is unconfirmed.
**Suggested fix:** Route every Modal-backed sheet on the detail screen through one presenter that defers a present until the previous dismissal completes (the `useModalHandoff` pattern), and reset `requestMode` if the native present is refused so the button can be tapped again.
**Resolution:** Root cause found 2026-09-19 on the physical iPhone (Nic saw the Swap sheet open, dismiss and open again) and reproduced on the iPhone 17 simulator by screen recording: the "already presenting" controller was the sheet's own previous incarnation. `Screen` rendered its `RefreshControl` only while `scrollEnabled`, and on iOS the control is the scroll view's first child, so dropping it moved the content container to that child slot and React remounted every child, the presented `Modal` included (old host view dismisses, new one presents; UIKit refuses the second present while the first is still leaving, which is the dead button). Shift Detail toggled `scrollEnabled` on every first Swap because the widened team schedule range re-keyed its query and put the page into `loading` behind the sheet. Fixed in this pass: the `RefreshControl` stays mounted with `enabled={scrollEnabled}` (regression test asserts the page's DOM node survives the toggle), and `teamScheduleQuery` keeps its previous data while the wider range loads. Every screen that locks scrolling for a skeleton stops remounting its content. Requires `/audit` re-review before closing; Nic's re-test on the device is the visual proof.

### F-82 [P2] fixed - A production 404 under the app renders with every script blocked by the nonce CSP

**File:** apps/web/src/proxy.ts:203; apps/web/src/app/not-found.tsx; e2e/gridmaster-portal-states.spec.ts:167
**Found:** 2026-09-19 by the e2e workflow (run 35446510975, `next build` + `next start`) during the end-to-end pass after bea2342d
**Why it matters:** The authenticated app's policy is `'nonce-…' 'strict-dynamic'` in production because its pages are force-dynamic and Next stamps the nonce into them. An unknown path under that scope (`/gridmaster/does-not-exist`, or any mistyped app URL) is answered by the prerendered root `not-found` page, which carries no nonce, so the browser blocks all sixteen chunk scripts, `dg-theme-seed.js` and the inline bootstrap: the 404 shows as unhydrated HTML in the wrong theme. The test that pins this boundary was added on 2026-09-17 and has never been green in CI; locally it passes because dev mode keeps `'unsafe-inline'`.
**Suggested fix:** Give the not-found response a policy it can satisfy: either render the root `not-found` dynamically so the nonce is stamped, or have the proxy fall back to the static-page policy for responses it can tell are 404s. Verify with the CI e2e run, which is the only place the production policy is exercised.
**Resolution:** Fixed 2026-09-19: the root `not-found.tsx` awaits `connection()` so Next renders it per request and stamps the nonce it reads from the request CSP header; `next build` now lists `/_not-found` as dynamic. Verified on a production build (`next build` + `next start`) with the gridmaster not-found spec reporting no unexpected console failures; the CI e2e run on the release PR is the second proof.

### F-83 [P1] fixed - Gridmaster organization creation answers 500 unless a time zone was picked

**File:** apps/web/src/app/api/gridmaster/organizations/manage/route.ts:289; apps/web/src/components/gridmaster/OrganizationSetupWizard.tsx:134-142
**Found:** 2026-09-19 by /audit (scope: gridmaster functions, org lifecycle, super admin setup; lenses: all)
**Why it matters:** The Details step validates only the name, the API schema accepts an empty `timezone`, and the insert sends `timezone: input.timezone || null` into a `NOT NULL DEFAULT 'UTC'` column. Reproduced in the browser: with every other field filled and no time zone chosen, "Create Organization" answers `500 {"error":"Gridmaster organization request failed"}` (server log: `23502 null value in column "timezone"`) and the wizard shows only a generic red toast. The gridmaster has no hint which field is wrong.
**Suggested fix:** Require a time zone in the Details step (block Next with a field message) and make the route schema `timezone: z.string().trim().min(1)` so a missing value is a 400 with a field error, or omit the column so the `'UTC'` default applies. Add a route test for the empty-timezone body.
**Resolution:** Fixed 2026-09-19 in the same session, the other way round: the time zone is now deliberately optional for the gridmaster (hand-off mode) and the insert omits the column when blank so the `'UTC'` default applies; the super admin's Identity step points out the UTC default and collects the real zone. Route test "leaves the time zone to the database default when the gridmaster skips it" added; browser run created an org with only a name and the super admin, `timezone = UTC` in the row, no 500, and the super admin saved `America/Los_Angeles` from onboarding. Requires `/audit` re-review before closing.

### F-84 [P1] fixed - The gridmaster "Send password reset" never sends an email, then reports success and audits it as sent

**File:** apps/web/src/app/api/gridmaster/password-reset/route.ts:89-124; apps/web/src/components/gridmaster/AllUsersView.tsx:229-240; apps/web/src/components/gridmaster/GridmasterAccountsView.tsx:210-221
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: quality, security)
**Why it matters:** The route calls `auth.admin.generateLink({ type: "recovery" })`, which only generates a link and never delivers it; the returned `action_link` is discarded. Confirmed against local Mailpit: the route answered `{"success":true}` and wrote a `user.password_reset_sent` audit row while the mailbox stayed empty, whereas the user-facing `recovery-request` route (which uses `resetPasswordForEmail`) delivered "Reset your password" to the same address. Both views toast "Password reset email sent", so a gridmaster believes the user was helped and the audit trail records a delivery that never happened.
**Suggested fix:** Send the way `features/account/server/recovery-request.ts` does (`createAnonClient().auth.resetPasswordForEmail(email, { redirectTo })`), or deliver `data.properties.action_link` through Resend; write the audit row only after the send succeeds, and add a route test that asserts the sender is called.
**Resolution:** Fixed 2026-09-20. The route now sends with `createAnonClient().auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`, the same call the user-facing recovery route makes, and writes the `user.password_reset_sent` audit row only after that call returns without error. `generateLink` is gone. New `password-reset/route.test.ts` asserts the sender is called with the address, that a send error yields 500 with no audit row, and that the per-target cap still holds. Requires `/audit` re-review before closing.

### F-85 [P1] fixed - The org.created audit row persists the raw super-admin invitation token

**File:** apps/web/src/app/api/gridmaster/organizations/manage/route.ts:388-397,411-423
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: security)
**Why it matters:** When the super admin has no account yet, `superAdmin.pendingInvite.token` is placed in the response (needed for "Send Email") and then the whole `superAdmin` object is spread into `writeGridmasterAuditLog({ details })`. Confirmed in the local DB after creating an organization: `audit_log.details.super_admin.pendingInvite.token` holds the live token. That token is the credential `/api/invitations/register` accepts to create the pre-confirmed account and set its password, so a durable copy now sits in a table that gridmasters browse and export to CSV (`audit-log/export`). Feature 19d4's contract is that raw credentials never reach audit metadata.
**Suggested fix:** Log `{ kind, email, displayName }` only; never spread `pendingInvite` into `details`. Add a route test asserting the audit payload has no `token` key, and consider a one-off cleanup of existing rows.
**Resolution:** Fixed 2026-09-20. `org.created` now logs `super_admin: { kind, displayName, email }` and never the `pendingInvite` object; the token still travels in the response for "Send Email". Route test drives the pending-invite branch and asserts the audit payload has no token. Migration 024 scrubs `details.super_admin.pendingInvite` from existing rows (dry run against local: 3 rows cleaned, invitations untouched). Requires `/audit` re-review before closing.

### F-86 [P1] fixed - Deactivating a user from the portal leaves their issued tokens valid

**File:** apps/web/src/app/api/gridmaster/users/route.ts:167-179; apps/web/src/lib/auth/revocation.ts:20-35; apps/web/src/proxy.ts:340-420
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: security)
**Why it matters:** PATCH only writes `profiles.deactivated_at`. Nothing calls `revokeAllUserSessions`, the proxy never reads `deactivated_at`, and `authenticateRequest` checks only the signature and the revocation markers, so every access token the user already holds keeps working on web and mobile APIs until it expires (up to the 1h `jwt_expiry`); only a refresh through the hook drops them. `revocation.ts` names "account disabled" as exactly the case the per-user watermark exists for, and `force-logout`, `employees/status` and `organizations/access` all write it. The confirmation copy promises they "will be blocked from logging in across all orgs", which is true only for new sign-ins.
**Suggested fix:** Call `revokeAllUserSessions(userId)` (and `force_logout_user` for tracked sessions, as force-logout does) when `deactivate` is true; add a route test asserting the revocation write. Consider `requireSensitiveActionAuth` here for parity with force-logout.
**Resolution:** Fixed 2026-09-19 with migration 021 and the gridmaster users route: the JWT hook now refuses deactivated (and terminated) accounts at token issue, `requireOrgPermissions` refuses them for the token they already hold, and PATCH deactivate writes the revocation watermark. Runtime probe before the fix showed a deactivated user keeping every org API open; after it the account gets the disabled modal on sign-in and 403 ACCOUNT_DISABLED on API calls. Requires `/audit` re-review before closing.

### F-87 [P2] fixed - Members of a suspended or deleted organization are never told why they are locked out

**File:** apps/web/src/proxy.ts:617-630; apps/web/src/app/(app)/login/OrgLogin.tsx:292-324; apps/web/src/app/api/auth/login/route.ts:96-118
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality)
**Why it matters:** The proxy redirects to `/login?suspended=true` or `/login?deleted=true`, but `OrgLogin` never reads either flag, so the page renders as an ordinary sign-in. A sign-in attempt then fails through `switch_org`'s refusal, which the login route maps to a 403 `ORG_ACCESS_DENIED` and `OrgLogin` maps to the transient toast "We couldn't sign you in. Try again." (reproduced for both suspend and archive; screenshots `35b`/`42b`). A live session shows the normal dashboard for the cached org-access window and, after an archive, "Loading your workspace" with Try again / Sign out. The DB trigger does mail an in-app alert to super admins, which they cannot open. Nobody in the organization learns that the platform suspended or deleted it.
**Suggested fix:** Have the login route return a distinct code for a suspended/archived host org (it already knows from `lookupOrgBySlug`/`switch_org`), render a "This organization is suspended, contact support" / "This organization was deleted" state in `OrgLogin` for that code and for the `suspended`/`deleted` params, and let the bootstrap recovery screen say the same instead of "Loading your workspace".
**Resolution:** Fixed 2026-09-20. `lookupOrgBySlug` now caches archived/suspended state and answers `archived` distinctly; the login route returns `ORG_SUSPENDED` / `ORG_DELETED` (403) before `switch_org`; the login page passes the proxy's `?suspended` / `?deleted` flags through; and `OrgLogin` renders a lockout card ("This organization is suspended" / "has been deleted", contact support) instead of the form for the seed, the flags, and those codes. Route and component tests added. The proxy redirect now takes effect immediately because the lifecycle route drops the access and slug caches (F-95). Not changed: a live SPA session that never reloads still sees the bootstrap recovery screen until its next document load. Requires `/audit` re-review before closing.

### F-88 [P2] fixed - Gridmaster oversight counts sandbox clones as tenants

**File:** apps/web/src/app/api/gridmaster/_lib/oversight.ts:170-176; apps/web/src/app/api/gridmaster/dashboard/route.ts:19-23
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: quality)
**Why it matters:** The dashboard route filters `workspace_kind = 'real'` and the manage route refuses sandbox ids, but `loadOversightFacts` selects every organization. Overview, Billing Oversight, Compliance, Security and Org Health therefore include each user's Test Sandbox clone: `archivedCount` (the cleanup cron archives sandboxes), `missingStripeCount`, `trialsNotStartedCount`, `pendingSetupCount`, `riskiestOrganizations`, `orgRetention` and the billing table all inflate with organizations that are not customers, and a clicked row leads to an org the manage route then rejects.
**Suggested fix:** Filter `workspace_kind = 'real'` in the organizations select of `loadOversightFacts` and drop rows from the other fact tables whose `org_id` is not in that set; add an oversight test with one sandbox row.
**Resolution:** Fixed 2026-09-19: `loadOversightFacts` selects `workspace_kind = real` through `selectRealOrganizations`, with a test asserting the filter. Requires `/audit` re-review before closing.

### F-89 [P2] fixed - Oversight fact loading reads whole tables and is silently capped at 1000 rows each

**File:** apps/web/src/app/api/gridmaster/_lib/oversight.ts:180-262,621-623; supabase/config.toml:18
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: performance)
**Why it matters:** `selectRows` issues unbounded selects over memberships, employees, invitations, shift_requests, user_sessions, mobile_device_tokens, subscriptions, departments, focus areas, shifts, jobs, certifications, roles and profile change requests, and PostgREST truncates each at `max_rows = 1000` without an error (the L-3 comment already acknowledges this for schedule_cells). Past that size the per-org counts, "pending invitations", "open shift requests", session summaries and setup completeness are wrong with no signal. Every one of the five oversight routes reloads all twenty queries, so opening the portal costs ~100 full-table reads. Data-size dependent; the local seed stays under the cap.
**Suggested fix:** Aggregate in SQL (one RPC or grouped counts per org) or page through with `.range()`, and load the facts once per request (share between routes or cache briefly). Add a test that the loader does not depend on row-count defaults.
**Resolution:** Fixed 2026-09-20. Every unbounded oversight select now pages through `.range()` in 1000-row chunks until a short page, and the twenty-read facts load is memoised for 10 s per service client so the portal's five parallel views share one load (a failed load is not memoised). Tests: a 2007-row membership table is counted in full across three page reads; a second load within the window issues no reads. Requires `/audit` re-review before closing.

### F-90 [P2] fixed - The gridmaster invitations list ships every invitation's raw token to the browser

**File:** apps/web/src/app/api/gridmaster/invitations/route.ts:29-31; apps/web/src/components/gridmaster/organization-detail/InvitationsTab.tsx:21; apps/web/src/app/api/organizations/invitations/route.ts:107-140
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: security)
**Why it matters:** The select includes `token` for all invitations of an organization and the tab never reads it (confirmed: the response for the new org carried `hasToken: true`). The org-level route deliberately splits `fetchInvitation` (no token) from `fetchInvitationWithToken` (resend only). Each token is an account-creation credential for `/api/invitations/register`, so a list view now exposes them to browser devtools, extensions, and any response logging.
**Suggested fix:** Drop `token` from the select (the tab needs id, email, role, dates, employee_id). If a gridmaster resend is ever wanted, add a dedicated action that fetches one token server-side.
**Resolution:** Fixed 2026-09-20. `token` dropped from the gridmaster invitations select and from the client types; new route test asserts the column list excludes it. Requires `/audit` re-review before closing.

### F-91 [P2] fixed - Gridmaster archive cancels Stripe from the browser, unmentioned and unmatched by the API

**File:** apps/web/src/components/gridmaster/organization-detail/OverviewTab.tsx:216-246; apps/web/src/app/api/gridmaster/organizations/manage/route.ts:137-157; apps/web/src/app/api/organizations/delete/route.ts:127-143
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality)
**Why it matters:** The Archive dialog says data is preserved, then `handleArchive` fires `POST /api/gridmaster/subscription {action:"cancel"}` without reading the response and archives regardless. The archive API itself does nothing about billing, so an archive through the API (or the client cancel failing) leaves a paid subscription running, while an archive through the UI irreversibly cancels it with no mention and no restore path (Restore leaves `subscription_status = canceled`, so the restored org is billing-locked). The super-admin delete route does this server-side and records `stripeCanceled` in its audit row; the gridmaster path records nothing.
**Suggested fix:** Move the cancellation into the `archiveOrganization` branch server-side (mirroring `organizations/delete`), record the outcome in the audit details, and state it in the confirmation copy. Decide explicitly what Restore does with billing.
**Resolution:** Fixed 2026-09-20. Stripe cancellation moved into the `archiveOrganization` branch server-side (mirrors `organizations/delete`: cancel, mark the subscription and org `canceled`, log failures, never block the archive); the outcome is returned and recorded as `stripeCanceled` in the audit row; the browser no longer fires its own cancel; the Archive dialog says members lose access, billing is canceled, and restoring does not reactivate it. Route tests cover the cancel and the no-subscription paths. Requires `/audit` re-review before closing.

### F-92 [P2] fixed - A scheduled department with no focus area is a dead end in the Structure editor

**File:** apps/web/src/components/settings/DepartmentsSettings.tsx:933-934,1083-1113; apps/web/src/components/onboarding/steps/StructureStep.tsx:56-70; apps/web/src/components/onboarding/WizardModeContext.tsx:90
**Found:** 2026-09-19 by /audit (scope: super admin setup; lens: quality)
**Why it matters:** The row renders "Split into Focus Areas" only when the department has exactly one focus area and the focus-area rows plus "+ Add Focus Area" only when it has more than one; with zero it offers nothing but Delete. The wizard's Continue saves departments and focus areas as two separate `POST /api/settings/config` calls, so an interruption between them leaves exactly that state (reproduced by closing the tab mid-save: `departments = 1`, `focus_areas = 0`). The Schedule step then reads "No focus areas yet. Create focus areas first", the Structure step offers no way to do so, and the setup checklist never completes until the admin guesses to delete and recreate the department. Screenshot `16b`.
**Suggested fix:** Render the focus-area rows and "+ Add Focus Area" for `childFAs.length !== 1` (zero included), or auto-seed the single focus area for a scheduled department that has none. Ideally save departments and focus areas in one request.
**Resolution:** Fixed 2026-09-20. The scheduled-department row renders its focus-area rows and "+ Add <focus area>" for any count other than one, with a hint when there are none; test "offers to add a focus area to a scheduled department that has none". The two-request wizard save is unchanged. Requires `/audit` re-review before closing.

### F-93 [P2] fixed - send-invite-email mails any address a branded invitation with caller-supplied token and copy

**File:** apps/web/src/app/api/send-invite-email/route.ts:17-22,54-62,123-141
**Found:** 2026-09-19 by /audit (scope: org create, super admin setup; lens: security)
**Why it matters:** The route trusts `token`, `email`, `orgName` and `inviterName` from the body. It never checks that the token is a live invitation, that it belongs to that email, or that the caller (any super_admin of any organization, or a gridmaster) may act for that organization. A super admin can send "You're invited to join {any name} on DubGrid" from DubGrid's sender to arbitrary addresses with an arbitrary link token, bounded only by 5/hour per target and the per-actor limiter.
**Suggested fix:** Look the invitation up by token server-side (org, email, pending state), require the caller to be a super_admin of that org or a gridmaster, and derive `orgName` from the row. Reject on mismatch with the generic failure.
**Resolution:** Fixed 2026-09-20. The route looks the token up as a live, unaccepted, unrevoked, unexpired invitation in an unarchived organization, requires the address to match and the caller to be a gridmaster or a super admin of that organization, and takes the organization name from the row; anything else is a generic 404. Four route tests. Requires `/audit` re-review before closing.

### F-94 [P3] fixed - Structure step buttons read "+ Add add a role..." and "+ Add add a certification..."

**File:** apps/web/src/components/settings/StringListSettings.tsx:1090; apps/web/src/components/onboarding/steps/StructureStep.tsx:140,166
**Found:** 2026-09-19 by /audit (scope: super admin setup; lens: quality)
**Why it matters:** `StringListSettings` renders `+ Add {placeholder.toLowerCase()}` and the wizard passes placeholders that already begin with "Add a". Screenshot `16`.
**Suggested fix:** Pass the noun (`roleNoun`, `certNoun`) as an explicit `addLabel` prop, or derive the button label from `label` as the departments editor does.
**Resolution:** Fixed 2026-09-20. `StringListSettings` derives the add button from `label` (singular) with an explicit `addLabel` override, so it reads "+ Add Role" / "+ Add Certification"; the placeholder stays input hint copy. Requires `/audit` re-review before closing.

### F-95 [P3] fixed - Gridmaster archive, restore, suspend and unsuspend never invalidate the org caches

**File:** apps/web/src/app/api/gridmaster/organizations/manage/route.ts:137-224; apps/web/src/lib/cache.ts:20-27; apps/web/src/app/api/gridmaster/organizations/manage/route.test.ts:205-207
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality)
**Why it matters:** The subscription route drops `mwOrgAccess` after every billing change and the super-admin delete route drops `orgBySlug`, and the `PUBLIC_LOOKUP` TTL comment says archive does too, but the gridmaster route does neither: members keep passing the proxy for the cache window (observed: a full page load rendered the dashboard normally after suspension), and the 24h slug cache can keep an archived organization's login page resolving. The route test asserts `cacheDel` is not called, so the gap is codified.
**Suggested fix:** Call `cacheDel(CacheKey.mwOrgAccess(orgId), CacheKey.organization(orgId))` on all four state changes and `cacheDel(CacheKey.orgBySlug(slug))` on archive/restore; flip the test expectation.
**Resolution:** Fixed 2026-09-20. Archive, restore, suspend and unsuspend all drop `mwOrgAccess`, `organization` and `orgBySlug`; the route test that codified the gap now asserts the keys. Requires `/audit` re-review before closing.

### F-96 [P3] fixed - The "Organization Created" screen misstates the invited role and uses an em dash

**File:** apps/web/src/components/gridmaster/OrganizationSetupWizard.tsx:870,905; apps/web/src/app/api/gridmaster/organizations/manage/route.ts:376-379
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality)
**Why it matters:** The pending-invite card says "They will join as admin. You can promote them to super admin after they accept." while the route sends the invitation with `p_role: "super_admin"` (confirmed: `role_to_assign = super_admin`). The Finish button reads "Finish — Go to Organization" with U+2014. Screenshot `07`.
**Suggested fix:** "They will join as super admin." and "Finish: go to organization" (or two buttons).
**Resolution:** Fixed 2026-09-19 in the same session: the card now reads "They will join as the super admin of this organization as soon as they accept." and the button "Finish and go to organization". Re-ran the browser flow: the Invitations tab lists the invite as Super Admin, Pending (screenshots `07`, `09`). Requires `/audit` re-review before closing.

### F-97 [P3] fixed - Platform kill-switch changes never classify as high-risk in Security oversight

**File:** apps/web/src/app/api/gridmaster/_lib/oversight.ts:26,416; apps/web/src/app/api/gridmaster/platform-flags/route.ts:155,246; supabase/migrations/007_filtered_audit_log.sql:53
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: quality)
**Why it matters:** `HIGH_RISK_ACTIONS` lists `feature_flags.updated` (the per-organization override written by `organizations/settings`), but the kill-switch route writes `platform_feature_flags.updated` and `platform_feature_flags.created`. Flipping a platform switch, the highest-impact toggle the portal has, is invisible to the high-risk feed, the `recentHighRiskEvents` tile and the filtered audit query.
**Suggested fix:** Add the `platform_feature_flags.` prefix to `HIGH_RISK_ACTION_PREFIXES` and to the filtered audit-log allow-list.
**Resolution:** Fixed 2026-09-19: `platform_feature_flags.` added to the oversight high-risk prefixes and to the `get_filtered_audit_log` allow-list in migration 021. Requires `/audit` re-review before closing.

### F-98 [P3] fixed - lib/db/admin.ts is a dead gridmaster data layer

**File:** apps/web/src/lib/db/admin.ts; apps/web/src/lib/db/index.ts:20
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: quality)
**Why it matters:** 429 lines and 18 exports (`createOrganization`, `archiveOrganization`, `suspendOrganization`, `deactivateUser`, `fetchAuditLog`, `revokeInvitationAsGridmaster`, ...) built on the browser Supabase client; no file imports any of them, since every operation moved to the `/api/gridmaster/*` routes. The barrel keeps it alive and its `logAudit`/cache calls describe behaviour the real routes no longer share.
**Suggested fix:** Delete the module and its barrel export; keep any type that is still referenced.
**Resolution:** Fixed 2026-09-19: `lib/db/admin.ts` deleted and its barrel export removed; type-check clean. Requires `/audit` re-review before closing.

### F-99 [P3] fixed - assign_org_role_by_email matches the email case-sensitively

**File:** supabase/migrations/002_functions_triggers.sql:862; apps/web/src/app/api/gridmaster/organizations/manage/route.ts:78,321-368
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality)
**Why it matters:** The RPC looks up `auth.users WHERE email = p_email`, while `promote_gridmaster_by_email`, `send_invitation` and `accept_invitation` all compare `lower(...)`. A gridmaster typing `Jane@Example.com` in "Assign role by email" gets "User with email ... not found", and in the creation wizard an existing account silently takes the invitation path instead of being assigned.
**Suggested fix:** `WHERE lower(email::TEXT) = lower(p_email)` in a forward migration, and lowercase the email in the route schema.
**Resolution:** Fixed 2026-09-19 in migration 021: `assign_org_role_by_email` matches `lower(email)` and also revives an archived membership on conflict, which is what lets a reinstated or previously removed person back in. Requires `/audit` re-review before closing.

### F-100 [P3] fixed - Wizard job-editor copy clips and the display-mode sample overflows the column

**File:** apps/web/src/components/settings/Jobs.tsx:1811; apps/web/src/components/onboarding/steps/ScheduleStep.tsx:96-173
**Found:** 2026-09-19 by /audit (scope: super admin setup; lens: quality)
**Why it matters:** At 1440x900 the Placement and Per-shift Settings descriptions end mid-sentence at the card edge ("...the shifts where this job", "...only where this job needs t") and the "Full Names" display-mode sample runs past the 720px wizard column. Screenshots `19b`, `18`.
**Suggested fix:** Let the description elements wrap (`white-space: normal`, `min-width: 0`) and give the two samples a two-column grid that shrinks.
**Resolution:** Fixed 2026-09-20. Cause was the global `button { white-space: nowrap }` rule: the collapsible SectionBlock header and the display-mode cards are buttons. Descriptions in both now wrap (`white-space: normal`), the display-mode grid uses `minmax(0, 1fr)` columns and the card has `min-width: 0` so the sample shrinks with the column. Verified by rule, not screenshot. Requires `/audit` re-review before closing.

### F-101 [P3] fixed - Create Organization wizard fields have no label association

**File:** apps/web/src/components/gridmaster/OrganizationSetupWizard.tsx:464-469,522-546,605-645
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality)
**Why it matters:** The name, custom-label and super-admin inputs sit under styled `<label>` elements with no `htmlFor`/`id`, so assistive technology announces them unlabeled and the browser audit had to target placeholders. The location fields on the same step do it right (`useId`).
**Suggested fix:** Give each input an id and point its label at it, as `OrganizationLocationFields` does.
**Resolution:** Fixed 2026-09-20. Name, the three label inputs, and the super admin first name, last name, email and phone inputs carry `useId` ids with `htmlFor` labels; test asserts each via `getByLabelText`. Requires `/audit` re-review before closing.

### F-102 [P0] fixed - Gridmaster deactivation did not stop an open web session

**File:** supabase/migrations/002_functions_triggers.sql:243-273 (hook, superseded by 021); apps/web/src/proxy.ts:340-420; apps/web/src/app/api/shared/permissions.ts:440-470
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: security) during the terminate-account work
**Why it matters:** Deactivating an account only stripped the org claims from its next token. The proxy's profile fallback then resolved the same membership again, and no API route read `profiles.deactivated_at`, so a deactivated user who never signed out kept every organization API indefinitely. Reproduced with a throwaway member of Calm Haven: after PATCH deactivate, a full navigation to `/schedule` rendered normally with every `/api/*` call answering 200. Only a fresh sign-in was refused, and with the wrong copy ("We couldn't finish switching organizations").
**Suggested fix:** Refuse the account at the hook (403 "account disabled" envelope, before the refresh-lock check), refuse it in `requireOrgPermissions`, and revoke issued tokens on deactivate.
**Resolution:** Fixed 2026-09-19 exactly that way (migration 021, `permissions.ts`, `users/route.ts`), with a middleware test, a permissions test for both deactivated and terminated callers, and a users-route test for the revocation. Requires `/audit` re-review before closing.

### F-103 [P2] fixed - An organization id the portal cannot resolve rendered a blank pane

**File:** apps/web/src/components/gridmaster/GridmasterPortal.tsx:1133
**Found:** 2026-09-19 by /audit (scope: gridmaster functions; lens: quality), reported by the user as "clicking archived orgs leads to a blank page"
**Why it matters:** `view === "organization" && selectedOrg && (...)` rendered nothing when the id was not in the dashboard list: hard-deleted organizations still named in "busiest organizations" (their audit rows survive), sandbox clones, or any row clicked before the dashboard query resolved. Archived organizations themselves opened fine. Reproduced by clicking a deleted-org row: `main` was empty.
**Suggested fix:** Render a progress bar while the dashboard loads and an explicit "no longer available" state with a way back otherwise; name deleted organizations by their full id in the activity table.
**Resolution:** Fixed 2026-09-19: the portal shows the loading bar or the empty state, and oversight labels missing organizations "Deleted organization <id>" instead of an 8-character prefix. Requires `/audit` re-review before closing.

### F-104 [P2] fixed - A member whose organization row is no longer visible was sent to the billing gate

**File:** apps/web/src/proxy.ts:600-640
**Found:** 2026-09-19 by /audit (scope: org lifecycle; lens: quality) while probing termination
**Why it matters:** The org-access read runs as the caller under RLS. Once a membership is archived (removal, termination), the read returns no row, `evaluateOrganizationBillingAccess` saw `null` status and `null` trial end, classified it as `trial_pending`, and the person landed on `/billing-required` ("your admin is setting up") instead of being signed out. The same read was memoized under the organization's key, so caching that empty answer would have bounced every member of the org.
**Suggested fix:** Treat an empty (not errored) read as lost access and redirect to `/login`; never memoize an empty read under the shared key.
**Resolution:** Fixed 2026-09-19 with a middleware test covering both the redirect and the memo. Requires `/audit` re-review before closing.
