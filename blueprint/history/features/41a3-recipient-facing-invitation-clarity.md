# Feature: Recipient-facing invitation clarity

**From build-plan:** feature 41a3
**Status:** verified

## Goal

An invitee should be able to tell, from the email and the page it opens,
which organization is inviting them, exactly when the link stops working, and
whether a link they hold is the current one. A reissue (41a2) now kills the
previous link on the spot, but the emails look identical and the dead link's
page does not mention replacement, so a person holding two emails cannot tell
which one to use.

## In scope

- **The invitation email states its deadline.** It says "This invitation
  expires on {weekday, date} at {time} ({zone})", using the organization's
  configured timezone, and that the 72 hours are fixed and do not extend.
- **A reissued invitation says so.** Every reissue path (resend, access
  change, the create route's duplicate refresh, and the mobile resend and
  access-change paths) sends an email headed and subtitled as a new
  invitation that replaces the earlier one, saying the link in any earlier
  email no longer works. A first invitation says that only the newest link
  ever works.
- **A live link shows its deadline on the accept page.** The lookup returns
  the invitation's expiry, and the form shows it in the viewer's own local
  time with the zone named.
- **A dead link explains replacement without revealing why it is dead.** The
  single invalid-invitation state (accepted, expired, revoked, replaced and
  unknown stay indistinguishable) tells the person to use the link in their
  newest invitation email, sign in if they already accepted, or ask the
  organization for a new invitation.
- **A link that dies while the page is open** lands on that same invalid
  state instead of a form error.

## Out of scope

- **The joined-date correction.** Now its own sub-item, 41a4. It changes
  what "Date joined" means in the People table and is not recipient-facing.
- **The 72-hour policy.** The duration and its absolute, non-extending rule
  are unchanged.
- **Mobile app screens.** The app has no accept flow. Its invitation emails
  change only through the shared template.
- **Supabase's generic invite template.** It stays unused (F-22).
- **Naming the inviter.** Emails still name the organization and nobody in it
  (the misaddressed-email rule).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - the expiry formatter and the email template** - add a pure
      `formatInvitationExpiry(expiresAt, timeZone)` that renders an absolute
      deadline with the zone named, falling back to UTC for a missing or
      invalid zone and returning null for a missing or unparseable date. Give
      `InviteEmail` `expiresAt`, `timeZone` and `kind: "new" | "reissue"`
      props: the reissue variant has its own heading, preview and replacement
      sentence, and both state the fixed deadline. The sender accepts the
      three as optional for now (kind defaults to `new`, the deadline line is
      omitted without a date), so the app compiles while the call sites are
      wired; Step 3 makes them required. _Done when:_
      formatter tests cover a DST boundary, an invalid zone, UTC and a missing
      date; template render tests prove both variants state the deadline, the
      reissue variant says the earlier link no longer works, and neither names
      a person.
- [x] **Step 2 - the sender and the web call sites** - `sendInvitationEmail`
      takes `expiresAt`, `timeZone` and `kind`, and uses a reissue subject
      ("Your new invitation to join {org} on DubGrid"). `sendPendingInvitationEmail`
      reads the organization's timezone with its name. Wire the five web sites:
      create (`new`), create's duplicate refresh (`reissue`), Gridmaster setup
      (`new`), resend (`reissue`), and access change (`reissue`), each passing the
      expiry it just stored. _Done when:_ route tests assert each site sends its
      kind and the stored expiry.
- [x] **Step 3 - the mobile call sites, then make the inputs required** - wire
      the seven mobile sends, passing the stored expiry and
      `auth.currentOrg.timezone`: new person invitation and new management
      invitation (`new`); person resend, management resend, management-user
      access change and org-role change (`reissue`); and person management
      access, whose one send is `new` when it created the invitation and
      `reissue` when it rotated a pending one. Then make `expiresAt`,
      `timeZone` and `kind` required on the sender. Correct the stale
      `person-org-role.ts` comment that says an access change makes a new row.
      _Done when:_ mobile route tests assert the kind and expiry per site,
      including both branches of person management access, and type-check with
      the inputs required proves no web or mobile caller omits them.
- [x] **Step 4 - the deadline on the accept page** - the lookup returns
      `expiresAt` for a live invitation only (the dead-token response is
      unchanged), and the form shows "This invitation expires {local date and
      time} ({zone})" in the viewer's timezone. _Done when:_ lookup route tests
      prove the field is present for a live token and absent from every dead
      response; page tests show the line, and its absence when the lookup is
      unavailable.
- [x] **Step 5 - the invalid state explains replacement** - rewrite the one
      invalid-invitation card and `DEAD_INVITATION_MESSAGE` to name replacement
      and point to the newest email, and route a dead-token failure from
      acceptance to that card instead of a form error. When the account was
      created moments earlier in the same attempt, the card also says the
      account exists, as the form error does today. _Done when:_ page tests
      prove the same card for every dead reason, for a link that dies mid-page,
      and the account-created variant; the three-browser E2E in `invitation-reissue.spec.ts` shows the
      old link's card after a reissue and the deadline on the new link, with
      screenshots and no console errors.

## Files / areas

- `apps/web/src/emails/InviteEmail.tsx` and its test.
- A new expiry formatter beside the email code (web), with a unit test.
- `apps/web/src/features/mobile/server/invitation-email.ts` (the sender).
- `apps/web/src/features/organization/server/invitation-delivery.ts`.
- Web call sites: `app/api/organizations/invitations/create/route.ts`,
  `app/api/organizations/invitations/route.ts`,
  `app/api/gridmaster/organizations/manage/route.ts`.
- Mobile call sites: `features/mobile/server/routes/` `person-invitation.ts`,
  `management-users.ts`, `management-user.ts`, `management-user-invitation.ts`,
  `person-management-access.ts`, `person-org-role.ts`.
- `app/api/invitations/lookup/route.ts`, `features/account/client/api.ts`
  (`InvitationLookup`), `app/(app)/accept-invite/page.tsx` and
  `acceptFailure.ts`, `lib/auth/dead-invitation.ts`.
- `e2e/invitation-reissue.spec.ts`.

## Data / contracts

- **`InvitationLookup` gains `expiresAt: string | null`** (ISO timestamp).
  Present only for a live invitation. Load-bearing: the accept page reads it,
  and the dead-token contract (`INVITATION_INVALID`, one message for every
  reason) must not change shape or gain a field.
- **`sendInvitationEmail` input gains `expiresAt`, `timeZone` and `kind`**, all
  required, so the compiler finds every call site.
- `organizations.timezone` (already `TEXT NOT NULL DEFAULT 'UTC'`) is read, not
  changed. No migration. Web reads it with the organization name in
  `sendPendingInvitationEmail`; mobile already has it on `auth.currentOrg`.

## Testing

Vitest and Playwright are configured, so the testing gate is on.

- **Logic needing tests:** the expiry formatter (pure), the template variants
  (render to text), the sender's subject by kind, every call site's kind and
  expiry, the lookup route's live-only `expiresAt`, and the page's invalid-state
  routing.
- **Browser evidence:** Step 5's E2E in Chromium, Firefox and WebKit. E2E runs
  without a Resend key, so the email is proven by render tests, not delivery.
- **Manual try:** invite an address you own, reissue it, and compare the two
  emails and both links.

## Notes for the AI

- The misaddressed-email rule stands: name the organization, never the inviter
  or actor, and resolve everything server-side.
- Keep dead tokens indistinguishable. The lookup must not return `expiresAt`, or
  anything else, for an expired, accepted, revoked, replaced or unknown token.
- The organization's timezone may be any string; `Intl` throws `RangeError` on
  an invalid zone, so the formatter must catch it and fall back to UTC.
- The accept page formats in the viewer's own timezone (the browser's), while
  the email uses the organization's, because the email has no viewer.
- Web routes use the effective, sandbox-aware `orgId` as they already do.
- No em dashes in copy, comments or commits.

## Plan change

`7a7c5408` recorded the decision to fold a joined-date correction into 41a3,
and the item 41 restore in `085a16f0` dropped it from `build-plan.md`. Approved
on 2026-09-25, it now stands as its own sub-item, 41a4, since it is a separate
People-table and data change rather than recipient-facing.
