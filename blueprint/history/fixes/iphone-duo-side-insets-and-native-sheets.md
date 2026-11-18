# Fix: iPhone Duo - content clears the side column, sheets fit themselves, gates are native on iOS

**Type:** Fix
**Status:** verified
**Branch:** `fix/iphone-duo-side-insets`

### The problem

A run of the stock `dev` build on the iPhone Duo simulator (iOS 27.2, 2026-11-17,
all four poses) found three problems. iOS ignores the app's portrait lock on
the Duo, so the open poses already reach users.

1. **Content runs under the side column.** Closed, open and partly folded, the
   Duo puts the status bar, camera and tab bar in a column on the trailing edge.
   Native parts (tab bar, toolbar items, Back) move into it, but DubGrid's own
   content ignores the left and right safe-area insets and runs underneath.
   - `Screen` (`src/shared/components/Screen.tsx`) pads its content, sticky
     header shell and footer by the fixed `getScreenGutter()` and reads only
     the top and bottom insets. This affects the Home header (alerts bell, My schedule | Team
     switch), the Schedule week strip, Requests chips, People rows and Profile
     cards.
   - `OnboardingScreen` uses `SafeAreaView edges={["top", "bottom"]}`, so
     "Welcome to DubGrid" runs under the clock and Skip sits under the camera
     where it can't be tapped.
2. **Native sheet content is sized to the window.**
   `BottomSheetModal.native.tsx` gives the sheet body `width: windowWidth`. On
   a wide screen iOS presents the sheet centered and narrower than the window,
   so the content overflows it: in Change staff status the title sits
   off-centre and the list card runs into the sheet's right edge. `@expo/ui`
   57's `RNHostView` already takes the width from the sheet when it fits its
   content.
3. **Gates still use the drawn sheet on iOS.** The owner wants native sheets on
   iOS (2026-11-17). `presentationKind="gate"` falls back to
   `BottomSheetModalDrawn` for `ConsentGate`, `TermsGate` and
   `TwoFactorReenrollGate`, though only the app lock (`backdrop="cover"`)
   needs the drawn sheet's cover.

### The fix

- Add the side safe-area insets to the gutter wherever `Screen` pads
  horizontally (content container, sticky header shell, footer), through one
  pure helper in `screen-layout.ts`. `OnboardingScreen` covers every edge.
  Bleeds that cancel the gutter (`ScrollableTabStrip`, the schedule strip) keep
  cancelling only the gutter, so they stop at the safe edge.
- Size native sheet content to the sheet, not the window. On a phone the
  content is the screen less iOS 26's floating inset (8 on each side,
  measured). On a regular-width screen (744 and up) every iOS sheet takes the
  detent path, the one `@expo/ui` passes the sheet's own width through; a
  content-fitted sheet passes only its height.
- On iOS, a gate presents as the native sheet with `dismissDisabled` (no swipe,
  no scrim tap, no close button); the app lock keeps the drawn sheet, and
  Android is unchanged.

Must not break: the iOS large-title collapse and pull-to-refresh (the scroll
view stays a shallow child), the gutter's alignment with the large title on a
phone with no side insets, text wrapping inside a content-sized sheet on a
phone, the consent focus contract (`useIsConsentDecisionPending`), and the
gates' "answer with a button" rule.

### Build steps

- [x] **1. Side insets in `Screen` and onboarding.** Add a tested helper that
      returns the leading and trailing padding (gutter plus inset), use it in
      `Screen`'s content container, sticky header shell and footer, and let
      `OnboardingScreen`'s safe area cover every edge.
      **Done when:** on the closed Duo, Home, Schedule, Requests, People and
      Profile content stops at the side column, and onboarding's Skip can be
      tapped; on a regular iPhone the gutter is unchanged (20 on iOS).
- [x] **2. Sheets fit themselves.** Drop the window width from the native
      sheet body.
      **Done when:** opened, Change staff status shows its title centred and its
      card inside the sheet's margins; on a phone-width screen a long row still
      wraps.
- [x] **3. Native gates on iOS.** Only `backdrop="cover"` (and gates on
      Android) fall back to the drawn sheet.
      **Done when:** on iOS the privacy choice is a native sheet that a swipe or
      scrim tap can't close, Essential only and Accept all still close it, and
      the sheet tests cover the gate path.

### Verify

- `npm run test:mobile`, `npm run type-check`, `npm run lint`.
- iPhone Duo simulator: closed, open, partly folded and held tall on Home,
  Schedule, Requests, People and Profile; the welcome screen and its Skip; a
  person's Change staff status sheet opened; a fresh install's privacy sheet.
- A phone-sized iOS simulator: the gutter and a content-sized sheet look as
  before.

## Findings

### iphone-duo-side-insets-and-native-sheets/F-173 [P2] closed - The staffed call-off trigger resolves every publish change before checking whether any pickup is waiting

**File:** `supabase/migrations/099_away_until.sql:3811-3930` (`finalize_scheduler_staffed_calloffs`, AFTER INSERT on `schedule_publish_changes`); `082` `resolve_schedule_state_storage`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Each worked change runs `resolve_schedule_state_storage` twice (several job, shift and absence-type lookups) before scanning for open pickups that day, which usually returns none. A month publish for 150 people is about 3,000 runs. Out of lens and unchecked: `resolve_schedule_state_storage` raises on a since-archived job or shift, which could fail a whole publish.
**Suggested fix:** Return early unless an open pickup with a parent exists for the org and date (`idx_shift_requests_org_open_pickups`). Check the archived-reference case separately.
**Resolution:** Fixed by migration 117 (`117_archived_items_stay_scheduled.sql`), found by the 2026-11-13 re-check: `finalize_scheduler_staffed_calloffs` returns early unless an open pickup with a parent exists for the organization and date, and uses `resolve_existing_schedule_state_storage`, so an archived reference no longer fails a publish.

### iphone-duo-side-insets-and-native-sheets/F-244 [P2] closed - An Admin never configured shows no permissions, and can't be edited on mobile

**File:** `apps/mobile/src/features/people/screens/PersonDetailScreen.tsx:1051-1055, 1811`; `apps/web/src/components/staff-detail/PersonInfoCards.tsx:177-189`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: UX)
**Why it matters:** Both gate on a stored set. For an Admin with `NULL` (F-239's common case), web drops the Permissions line and mobile hides the Permissions row, so a Super Admin on the phone has no way to set them.
**Suggested fix:** Gate on `orgRole === "admin"` and count from `buildInitialPermissions(stored)`.
**Resolution:** Fixed by migration 131 (`131_admin_permissions_complete.sql`), found by the 2026-11-13 re-check: a trigger stores a complete permission set for every Admin and backfilled existing ones, so the web Permissions line and the mobile Permissions row always show.
