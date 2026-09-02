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

### F-30 [P2] open - Most authenticated mobile queries use the rotating token as cache identity

**File:** apps/mobile/src/features/auth/hooks/useBootstrap.ts:15-50; apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx:689-709; apps/mobile/src/features/profile/screens/ProfileScreen.tsx:117-125; apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:80-81
**Found:** 2026-09-01 by /audit (scope: apps/mobile; lenses: quality, performance, tests)
**Why it matters:** Bootstrap correctly keys cached data by stable user and organization claims because Supabase rotates the token automatically and a raw-token key creates a brand-new empty cache entry. Schedule, profile, notifications, people, dashboard, requests, and other authenticated queries still embed the raw token, so normal refreshes fragment the cache, refetch mounted data, and can repaint loading states across a running app. Only bootstrap currently has a token-rotation regression test.
**Suggested fix:** Introduce a shared authenticated query identity built from stable `(sub, org_id)` claims, use it consistently in query and invalidation keys, keep the current token only inside the request function, and add token-rotation tests for representative schedule, profile, and infinite-query consumers.
**Resolution:**

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
