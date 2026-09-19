# One-click calendar subscription on web and mobile

**Type:** Fix

**Status:** verified

## The problem

Subscribing to the schedule today takes five steps: create the private link on
the web Profile page, copy it, open the calendar app, find its "subscribe by
URL" setting, paste. The user has to know where each app hides that setting,
and the mobile app has no calendar entry point at all, although the phone is
where people most want their shifts.

The mechanism underneath is right: a private tokenised ICS feed at
`/api/calendar/feed/<token>` that calendar apps poll, so shifts stay live. Only
the hand-off into the calendar app is manual.

## The fix

Deep-link the same feed URL straight into each calendar's subscribe flow, so
one click or tap does the whole thing. "Copy link" stays as the fallback for
apps without a deep link (Fantastical, Thunderbird).

| Target                      | Link                                                                                                   | What the user sees                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Apple Calendar (iOS, macOS) | `webcals://<host>/api/calendar/feed/<token>` (`webcal://` when the feed is plain http, i.e. local dev) | Calendar opens its Subscribe sheet with the URL filled in |
| Google Calendar             | `https://calendar.google.com/calendar/r?cid=<url-encoded feed URL>`                                    | Google Calendar asks "Add this calendar?"                 |
| Outlook                     | `https://outlook.live.com/calendar/0/addfromweb?url=<enc>&name=DubGrid`                                | Outlook's subscribe form, pre-filled                      |

Outlook personal (`outlook.live.com`) and Microsoft 365
(`outlook.office.com`) use the same path; ship personal, since it is the
address that works unauthenticated, and note the 365 variant in the card's
help text only if manual verification shows it is needed.

Mobile gets a "Calendar subscription" screen under Profile with the same
targets as tappable rows (Apple Calendar on iOS only), driven by a new mobile
API route that wraps the existing account server functions.

**Token rule, kept as is.** The schema holds one token per user, org and
employee (`calendar_feed_tokens_scope_unique`) and the raw URL is disclosed
only at create or replace time (19d4 token secrecy). Most people subscribe once
in an account that syncs everywhere (iCloud, Google), so one token is enough
and a schema change is not justified here. The consequence to handle: on
mobile, when a subscription already exists (created on web, say), tapping a
calendar row must confirm that it replaces the existing link and disconnects
whatever uses it, before rotating. Web already confirms this. Per-device tokens
remain a possible later feature, not part of this fix.

Must not change:

- The feed route, its headers, or `resolveCalendarFeed`.
- The one-token scope, the disclosure rule, or the web card's create, replace
  and disable flows and their in-app confirmations.
- The web-only boundary: reports, billing, the Gridmaster portal, the
  permissions editor and organization settings stay web-only. Calendar
  subscription is not on that list, so mobile parity here is consistent with
  `project-overview.md`.

## Build steps

- [x] **1. Shared deep-link builder**
  - Add `packages/domain/src/calendar-links.ts` exporting
    `buildCalendarSubscribeLinks(feedUrl: string): { apple: string; google: string; outlook: string }`,
    plus a `CalendarSubscribeTarget` union (`"apple" | "google" | "outlook"`)
    with display labels. Pure string work: swap `https:` to `webcals:` and
    `http:` to `webcal:` for Apple; `encodeURIComponent` the feed URL into the
    Google `cid` and Outlook `url` params; reject anything that is not an
    absolute http(s) URL.
  - Export from `packages/domain/src/index.ts` and rebuild packages.
  - Tests in `calendar-links.test.ts`: https and http inputs, a token with
    URL-unsafe characters survives encoding, a relative or `javascript:` input
    throws.
  - Done when the tests pass and `npm run build:packages` succeeds.

- [x] **2. Web: subscribe buttons in the card**
  - In `apps/web/src/components/profile/CalendarSubscriptionCard.tsx`, when
    `feedUrl` is disclosed, render three buttons above the URL row: "Apple
    Calendar", "Google Calendar", "Outlook", built from step 1. The Apple one is
    a plain `<a href="webcals://…">`; Google and Outlook open in a new tab with
    `rel="noopener noreferrer"`. Use the peer-button grid rule from
    `coding-standards.md` (three actions: two above, one full-width below on
    narrow widths). "Copy link" moves under them as the secondary action.
  - Update the card subtitle and the not-yet-created copy to say "Add it to
    Apple Calendar, Google Calendar, or Outlook in one click, or copy the link
    for any other app."
  - Extend `CalendarSubscriptionCard.test.tsx`: after create, the three links
    exist with the expected hrefs; they are absent when the URL is not
    disclosed.
  - Done when the test passes, `npm --workspace @dubgrid/web run type-check`
    passes, and a browser screenshot of the card shows the three buttons at
    1280 px and at 375 px without wrapping labels.

- [x] **3. Mobile API route**
  - Add `mobileCalendarSubscriptionStatusSchema` and
    `mobileCalendarSubscriptionIssuedSchema` to `packages/contracts/src/mobile.ts`
    (mirror `CalendarSubscriptionStatus` / `CalendarSubscriptionIssued`).
  - Add `apps/web/src/features/mobile/server/routes/profile-calendar-subscription.ts`
    with `GET` (status), `POST` (create), `PUT` (rotate) and `DELETE` (revoke),
    each behind `requireMobileAuth`, resolving the org from the mobile claims
    and calling `getCalendarSubscriptionStatus`, `issueCalendarSubscription`
    and `revokeCalendarSubscription` from `@/features/account/server`. Build
    `feedUrl` from the request origin exactly as the web route does. Map
    `CalendarSubscriptionError` to the same 404/409 bodies as
    `app/api/account/calendar-subscription/route.ts`.
  - Expose it at `apps/web/src/app/api/mobile/v1/profile/calendar-subscription/route.ts`
    following `profile/sessions/route.ts`.
  - Tests in `profile-calendar-subscription.test.ts`: unauthenticated 401,
    missing org 404, create returns an absolute `feedUrl`, revoke returns
    `active: false`.
  - Done when the tests pass and web type-check passes.

- [x] **4. Mobile screen**
  - Add `getCalendarSubscription`, `createCalendarSubscription`,
    `rotateCalendarSubscription` and `revokeCalendarSubscription` to
    `apps/mobile/src/shared/lib/api.ts`, validated with the step 3 schemas,
    and a `mobileQueryKeys.calendarSubscription` key.
  - Add `apps/mobile/src/features/profile/screens/ProfileCalendarScreen.tsx`
    and the route `apps/mobile/app/(tabs)/profile/calendar.tsx`, reached from a
    new "Calendar subscription" row in the Profile hub's Settings section.
  - Screen content: a `ProfileSection` "Add to calendar" with `PressableRow`s
    for Apple Calendar (iOS only), Google Calendar, Outlook and "Share link".
    There is no clipboard dependency on mobile and this fix does not add one;
    "Share link" uses React Native's built-in `Share.share({ url })`, which
    offers Copy alongside every other app in the system share sheet.
    Tapping a row: if no active subscription, `POST` create then
    `Linking.openURL(link)`; if one exists and no URL is held in memory for
    this session, show a `ConfirmationModal` ("Replace the existing link? Any
    calendar already using it stops updating.") and on confirm `PUT` rotate
    then open. Hold the issued URL in component state so a second row tap in
    the same visit reuses it instead of rotating again. A "Disable
    subscription" row at the bottom confirms then `DELETE`s.
  - Use the existing `Screen`, `StatusBanner`, `ConfirmationModal` and
    `useMobileContentState` patterns from `ProfileSessionsScreen.tsx`; no new
    sheet, so the stacking guard is untouched.
  - Tests in `ProfileCalendarScreen.test.tsx`: rows render per platform;
    first tap with no subscription creates and opens without a confirmation;
    tap with an existing subscription confirms before rotating; cancel leaves
    it untouched; the Apple row is absent on Android.
  - Done when the tests pass, `npm --workspace @dubgrid/mobile run type-check`
    passes, and a simulator screenshot shows the screen.

## Verify

- `npm run test:web -- CalendarSubscriptionCard profile-calendar-subscription`
  and `npm run test:mobile -- calendar-links ProfileCalendarScreen` pass.
- Web, signed in as `qa-super-admin@dubgrid.test` on `calmhaven.localhost:3000`
  Profile: create a link, click "Google Calendar", confirm Google shows its add
  prompt with the DubGrid feed URL; click "Apple Calendar" on macOS, confirm
  Calendar.app opens its Subscribe sheet with the `webcal` URL; click
  "Outlook", confirm the pre-filled subscribe form. Then "Copy link" still
  copies.
- iOS simulator: Profile, Calendar subscription, tap "Apple Calendar" with no
  existing subscription; the system Calendar subscribe sheet opens with no
  confirmation. Go back to web, note the subscription is now active. On mobile
  again, tap "Google Calendar": the replace confirmation appears; cancel leaves
  the web-created subscription working; confirm rotates and opens.
- Wrong looks like: any target opening a raw browser prompt, a label wrapping
  to two lines, an Android build showing an Apple Calendar row, a second tap in
  the same mobile visit silently rotating the token, or a mobile tap replacing
  an existing link without the confirmation.

## Evidence

- `packages/domain` calendar-links tests: 4 pass. Web card test: 5 pass.
  Mobile route test: 6 pass. Mobile screen test: 7 pass (incl. Android row
  omission). Web and mobile `type-check` clean; ESLint clean on changed files.
- Web: Playwright against the worktree dev server (`calmhaven.localhost:3001`,
  `qa-super-admin@dubgrid.test`) created a link and read the three hrefs:
  Apple `webcal://...` (http feed in dev), Google `calendar.google.com/calendar/r?cid=<enc>`,
  Outlook `outlook.live.com/calendar/0/addfromweb?url=<enc>&name=DubGrid`.
  At 375 px every subscribe button measured 44 px tall (one line).
- Mobile: simulator screenshot taken from the main checkout's Metro after the
  fast-forward (see the commit note in `blueprint/history/fixes/`).
- Not exercised: the real Calendar.app / Google / Outlook subscribe prompts,
  which need a manual pass per the Verify section.
