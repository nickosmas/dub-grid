# Current Feature

**Title:** Alerts and activity surfaces show org users only what they can act on

**Type:** Fix

**Status:** verified

## The problem

Four related defects, all confirmed in code (full design at
`/Users/nickosmas/.claude/plans/splendid-hopping-snowglobe.md`):

1. **The web bell popup never opens an alert.** A row click only marks the
   alert read (`apps/web/src/components/NotificationBell.tsx:462`); a read row
   does nothing. `/alerts` has no URL parameter that opens one item, and the
   gridmaster portal bell has no way to open one in its inbox view.
2. **Bell rows scroll sideways.** `apps/web/src/app/globals.css:696` sets
   `button { white-space: nowrap }` for every button, and each popup row is a
   `<button>`, so the message never wraps and the `overflowY: auto` list grows
   wider than its 360px container.
3. **Mobile unread rows have no tint.** `NotificationRow.tsx` shows a dot and
   a semibold title on `mobileColors.background`; web tints unread rows with
   `--dg-color-info-bg`, whose hex values equal mobile's `brandSoft`.
4. **Org users see platform detail.** Three surfaces leak it:
   - The alert detail (web modal, mobile screen) renders every metadata key
     through `packages/domain/src/notification-metadata.ts`, whose blocklist
     misses `session_id`, `gridmaster_email`, `justification`, `expires_at`,
     `stripeInvoiceId`, `amountDue` (cents), `periodKey`, `orgId`, `slug`,
     `ipAddress`, `deviceLabel`.
   - Settings > Activity Log returns every `audit_log` row for the org through
     `GET /api/gridmaster/audit-log/full`: per-login `security.auth.*` events
     rendered as "Auth: security" with a SHA-256 "Target Hash" (unregistered
     in `lib/audit/registry.ts`), impersonation, feature-flag edits, exports
     of the log itself, gridmaster billing operations, and Stripe webhook
     payloads flattened raw ("Amount Due: 4,900", "Currency: Usd").
   - Dashboard "Recent activity" on web (`lib/dashboard-stats.ts:689`) and
     mobile (`packages/mobile-api-core/src/dashboard.ts:515`) emits up to 12
     `Shift added · 2026-09-04` rows per publish plus raw status and role
     enums.

Decisions taken with the user on 2026-09-18: org users (staff, admin, super
admin) see an alert's title, message, time, action button, and human-written
notes (`note`, `adminNote`) only; the Activity Log keeps per-cell draft edits
for super admins but login/security, impersonation, feature flags, audit
exports, gridmaster billing operations, platform actions, and unregistered
actions become gridmaster-only, with Stripe rows showing curated details.
Mobile has no popup (the bell pushes `/alerts` and rows open `/alerts/[id]`),
so items 1 and 2 are web-only.

## The fix

One shared `Audience` (`"org" | "platform"`) in `@dubgrid/domain`, derived
from `isGridmaster` (an impersonating gridmaster is `"org"`, which is the
intended experience). Both detail formatters take it:

- `formatNotificationMetadata(metadata, { audience })` becomes an allowlist
  (`note`, `adminNote`) for `"org"` and keeps the humanized dump, minus a few
  more id keys, for `"platform"`. The option is required so both callers must
  declare their audience.
- Audit registry specs gain `audience?: Audience` (omitted means org). The
  two audit-log routes filter server-side (pagination is offset-based and the
  period stats must agree with the rows): org callers get an allowlist of
  org-visible action names passed as `p_action_prefixes` (the SQL applies
  `LIKE prefix || '%'`, so no migration) or `.in("action", ...)` for day
  counts; an empty allowlist short-circuits to empty results because
  `cardinality = 0` means "no filter" in `007_filtered_audit_log.sql`.
  `security.auth.*` and `invitation.auto_revoked` get registered so
  gridmasters read real copy; every org-visible `billing.*` spec renders its
  own curated details so the Stripe payload never flattens.

Bell rows become `<Link href="/alerts?open=<id>" prefetch={false}>` (or a
`<Button>` calling a new `onOpenItem(id)` prop in the gridmaster portal) with
`whiteSpace: normal` and `overflowWrap: anywhere` on the text column; no global
CSS change. The `/alerts` page wrapper reads `?open`, and `InboxView` gains
`openNotificationId` / `onOpenHandled` props: it finds the alert on the loaded
page or fetches it by a new optional `id` on `POST /api/notifications/search`
(keeps user, channel, and org scoping; skips read/archived filters), then
reuses `handleRowClick` so mark-read and facets refresh stay in one place.
The wrapper clears the param with `router.replace` so re-clicking the same
item re-opens it.

Recent activity folds cell changes into one publish row through shared
describers in `packages/domain/src/dashboard-activity.ts`; shift-request
status labels move from web `client-facing.ts` into
`packages/domain/src/requests.ts` (re-exported on web) so both builders share
them.

Must not break: the gridmaster per-org "Organization Activity" view (same
route, platform audience, unfiltered), the person Activity tab (already
server-allowlisted), `AlertsInbox.facets-invalidation.test.tsx` (renders
`InboxView` bare, so `next/navigation` stays out of `InboxView`), the mobile
harness (drops `style`, so the tint is screenshot-proven), and existing
`e2e/alerts-states.spec.ts` route mocks.

## Build steps

Build one step at a time; show the diff; wait for approval before the next.

- [x] **Step 1 - Shared audience + org-only alert details.** Add
      `packages/domain/src/audience.ts` (`Audience`, `audienceForViewer`),
      export from the index; change `formatNotificationMetadata` to take a
      required `{ audience }` (org allowlist `note`, `adminNote` in that order;
      platform keeps the blocklist path plus `session_id`, `gridmaster_id`,
      `target_user_id`, `stripeInvoiceId`, `orgId`); add
      `notification-metadata.test.ts`; `NotificationDetailModal` in
      `AlertsInboxPage.tsx` takes `audience` from `audienceForViewer(perms)`;
      mobile `MetadataList` passes `{ audience: "org" }`. Rebuild packages.
      _Done when:_ the domain test proves org shows only Note / Admin note and
      hides `session_id`, `stripeInvoiceId`, `requestedBy`, and dynamic field
      keys while platform keeps humanized keys and drops ids; `npm run type-check` passes; a profile-change alert opened by the QA super admin
      shows title, message, time, Note, action and nothing else, and the same
      alert in the gridmaster portal still shows the full grid (screenshots).

- [x] **Step 2 - Bell rows wrap and navigate.** In `NotificationBell.tsx` add
      `onOpenItem?: (id: string) => void`; extract a `BellRow` rendering a
      `Link` to `/alerts?open=<id>` (`prefetch={false}`) or a `Button` calling
      `onOpenItem`; both close the popover, both `cursor: pointer`; text column
      gets `whiteSpace: "normal"` and `overflowWrap: "anywhere"`; remove
      `handleMarkRead`, `optimisticallyRead`, and the "(click to mark as read)"
      aria suffix. Add `NotificationBell.test.tsx` (mock the notifications
      client, `AuthProvider`, `@/hooks`, both realtime hooks, `next/link`).
      _Done when:_ rows render as `a[href="/alerts?open=<id>"]` without
      `onOpenItem` and as buttons calling `onOpenItem(id)` with it; the popover
      closes on click; the text column carries the two wrap styles; a
      300-character message wraps inside the 360px popover with no horizontal
      scrollbar at 100% and 200% zoom (screenshots).

- [x] **Step 3 - Resolve one alert by id.** `searchBodySchema` gains
      `id: z.string().uuid().optional()`; when present the route keeps user,
      channel, and org scoping, applies `.eq("id", id)` with `limit 1`, and
      skips read/archived/category/priority/search/cursor filters. Add
      `fetchNotificationById(id): Promise<Notification | null>` beside
      `searchNotifications` in `features/notifications/client/api.ts`. Extend
      `search/route.test.ts`. _Done when:_ the route test asserts `eq("id", id)` is applied, the read/archived filters are not, and org scoping still
      is; a request for another user's id returns nothing.

- [x] **Step 4 - Inbox opens the requested alert; portal path.**
      `AlertsInboxPage()` reads `useSearchParams().get("open")` and renders
      `<InboxView openNotificationId onOpenHandled={() => router.replace(pathname, { scroll: false })} />`.
      `InboxView` gains the two props and an effect on `[openNotificationId, loadingPage, notifications]`: after the first page loads, find the id or
      `fetchNotificationById`, call `handleRowClick(n)` (which now also
      invalidates `queryKeys.notifications.all(userId)`), toast "That alert is
      no longer available" on a miss, then `onOpenHandled()`; a
      `handledOpenIdRef` guards double-runs and resets on null.
      `GridmasterPortal.tsx` passes `onOpenItem` (set view, clear selection,
      `setOpenAlertId`) and `<AlertsInboxView openNotificationId onOpenHandled />`.
      Add `__tests__/AlertsInbox.open-param.test.tsx`. _Done when:_ with the id
      on the loaded page the modal opens, `markNotificationsRead([id])` runs
      and `onOpenHandled` fires; with the id absent `fetchNotificationById`
      runs and the modal opens; a miss toasts and still calls `onOpenHandled`;
      the same id after a null re-opens; in the browser a bell click from
      `/schedule` opens the modal with the URL settling on `/alerts`, and a
      gridmaster portal bell click switches to Alerts with the modal open.

- [x] **Step 5 - Mobile unread tint.** In `NotificationRow.tsx` add
      `rowUnread: { backgroundColor: mobileColors.brandSoft }` and pass
      `style={[styles.row, isUnread ? styles.rowUnread : null]}`; keep the dot
      and semibold title, no `fontWeight` edits. Recapture
      `alerts-ios-light-default-admin` and add `alerts-ios-dark-default-admin`
      via `scripts/mobile-shot.sh` into `blueprint/reference/mobile/` with
      README rows. _Done when:_ unread rows are brandSoft in both themes, a
      press still shows the gray highlight, read rows keep the page
      background; `npm run test:mobile` passes.

- [x] **Step 6 - Shared activity describers.** Add
      `packages/domain/src/dashboard-activity.ts` (`summarizePublishChanges`,
      `describeShiftRequestActivity`, `describeMemberSignupActivity` via
      `getOrgRoleLabel`) with tests; move `SHIFT_REQUEST_STATUS_LABELS` /
      `formatShiftRequestStatusLabel` into `packages/domain/src/requests.ts`
      (add `expired: "Expired"`, add a test) and re-export from web
      `client-facing.ts`. Rebuild packages. _Done when:_ domain tests pass;
      web type-check passes with the re-export.

- [x] **Step 7 - Mobile recent-activity builder.** In
      `packages/mobile-api-core/src/dashboard.ts` emit one `publish` row per
      publish with the change summary, drop the per-cell loop and its 12 cap
      and the local `getShiftRequestStatusLabel`, use the shared describers;
      rewrite the cap test as "folds changes into the publish description and
      emits no shift_change items", add an approved-status case and sign-up
      copy with a real org role; drop the "Shift changes" chip from
      `apps/mobile/app/(tabs)/home/activity.tsx` (keep `shift_change` in the
      contract enum and `ACTIVITY_TYPE_LABEL` for cached payloads). _Done
      when:_ `npx turbo run test --filter=@dubgrid/mobile-api-core` passes;
      mobile-shot `dashboard-activity-ios-light-default-admin` shows one
      publish row with a change summary and humanized request statuses.

- [x] **Step 8 - Web recent-activity builder.** Same change in
      `apps/web/src/lib/dashboard-stats.ts` ("Schedule published · ..." when
      no publisher name; keep `highlight` populated with the summary); add
      `dashboard-stats.test.ts`; drop the "Shift changes" chip from
      `components/dashboard/expanded/ExpandedActivity.tsx`. _Done when:_
      `npm run test:web` passes; a screenshot of the admin dashboard Recent
      activity shows no `Shift added · 2026-...` rows and no raw enums.

- [x] **Step 9 - Registry audience and new vocabulary.** In
      `lib/audit/registry.ts` add `audience?: Audience` to `AuditActionSpec`;
      set `"platform"` on `impersonation.*`, `feature_flags.updated`,
      `audit.exported`, `billing.portal_opened`, `billing.trial_extended| seats_synced|status_overridden|synced`, `gridmaster_account.*`,
      `platform_feature_flags.*`, and the new `security.auth.*`; add the
      `security` category and register `security.auth.login|recovery|mfa| session` (headlines from `outcome`/`reason`/`surface`, `details: () => []`) and `invitation.auto_revoked` (org-visible, `details: () => []`);
      curated `details` for every org-visible `billing.*` spec using a new
      `formatMinorUnits(amount, currency)` in `lib/audit/details.ts`; export
      `isVisibleToAudience`, `ORG_AUDIENCE_ACTIONS`, `ORG_AUDIENCE_CATEGORIES`.
      Extend `audit-registry.test.ts`: the platform list has `audience: "platform"` and the four `shift.*` actions do not; every org-visible
      `billing.*` spec defines `details`; every `ORG_AUDIENCE_CATEGORIES`
      entry has an org action; `declaredSecurityEvents()` reads
      `lib/auth/security-audit.ts` and asserts each name is registered;
      `TRIGGER_WRITTEN_ACTIONS = ["invitation.auto_revoked"]` (migration 010);
      the leak test feeds a 64-hex `targetHash` and raw cents and asserts
      neither renders. _Done when:_ tests and `npm run lint` pass; the only
      visible change is real copy for the previously unknown actions and
      curated billing rows.

- [x] **Step 10 - Server-side org scope.** Add `lib/audit/audience.ts`
      (`resolveAuditActionScope(audience, requestedPrefixes)` returning
      `{ kind: "open", prefixes }` or `{ kind: "allowlist", actions }`, with a
      test); `authorizeAuditLogRead` returns `{ serviceClient, audience }`;
      `audit-log/full/route.ts` passes the allowlist as `actionPrefixes` for
      org callers and returns `{ entries: [] }` without calling the RPC when
      it is empty; `audit-log/day-counts/route.ts` uses `.in("action", allowlist)`; `settings/ActivityLog.tsx` uses
      `getAuditCategoryOptions(ORG_AUDIENCE_CATEGORIES)`. Add three cases to
      `full/route.test.ts` (org caller passes the allowlist; org +
      `billing.` prefix passes only org-visible billing actions; org +
      `impersonation.` returns empty without the RPC; gridmaster passes
      prefixes through) and a new `day-counts/route.test.ts` for the `in`
      branch. _Done when:_ as the QA super admin, Settings > Activity Log
      shows draft cell edits and no login, impersonation, feature-flag,
      export, or gridmaster billing rows, the period total equals the visible
      row count, and the dropdown lacks Impersonation and Security; the
      gridmaster per-org "Organization Activity" still shows everything
      (screenshots for both roles).

- [x] **Step 11 - E2E and full verification.** Add "opens an alert from the
      header bell" to `e2e/alerts-states.spec.ts` as a separate test with no
      `page.route` mocks: sign in as the QA super admin, open the bell, click
      the first `a[href^="/alerts?open="]` inside `region[name="Alerts"]`
      (`test.skip` when "No alerts"), expect `toHaveURL(/\/alerts$/)` and a
      visible dialog. Run the full verification list below. _Done when:_ every
      command passes and the screenshots and mobile cells are captured.

## Verify

- `npm run build:packages`, then `npm run type-check`
- `npm run test:web`, `npm run test:mobile`
- `npx turbo run test --filter=@dubgrid/domain --filter=@dubgrid/mobile-api-core`
  (`test:mobile` does not cover these two packages)
- `npm run lint`
- `npx playwright test e2e/alerts-states.spec.ts`
- `scripts/mobile-shot.sh` cells: `alerts-ios-light-default-admin`,
  `alerts-ios-dark-default-admin`, `dashboard-activity-ios-light-default-admin`
- Manual (QA super admin unless noted): from `/schedule` click a bell row and
  confirm the alert modal opens with the URL on `/alerts`; a long message in
  the popup wraps with no horizontal scrollbar at 100% and 200%; a
  profile-change alert shows only title, message, time, Note, and the action
  (gridmaster portal still shows the full grid); Settings > Activity Log has
  no login, impersonation, feature-flag, export, or gridmaster billing rows
  and its period total matches the rows; the gridmaster Organization Activity
  view is unchanged; the admin dashboard Recent activity shows one row per
  publish; on mobile, unread alert rows are tinted in light and dark.
