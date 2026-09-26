# Feature: Security, sessions and two-factor recovery

**From build-plan:** feature 43c
**Status:** in progress (built alongside the web sign-in fix, which holds
`current-feature.md` in another session)

## Goal

The Gridmaster person page gains the two sections support reaches for when
someone is locked out or a device is lost: Security (two-factor and each
factor, known devices, any login lock) and Sessions and devices (every
session, push device and calendar feed), each with the action that fixes it.
A Gridmaster, and only a Gridmaster, can reset someone's two-factor: behind
step-up and with a required reason, it removes their factors, ends every
session, emails them, and makes them enroll again at their next sign-in on
web and mobile. Secrets (refresh, push and calendar tokens, device hashes, IP
addresses) never reach the page. Folds in F-80 (deactivate needs fresh
proof) and F-81 (the page refreshes on more than membership changes).

## Decisions (made 2026-09-26)

- **Re-enrollment flag:** migration 059 adds
  `profiles.mfa_reenroll_required_at`. The reset sets it; saving a verified
  factor (`updateSelfMfaStatus(true)`, which web and mobile both reach after
  enrolling) clears it.
- **Enforcement is a client gate** on web (beside `OnboardingGate`, over every
  app route) and mobile (beside `TermsGate`), both sending the person to the
  existing enrollment screen. It is a recovery step, not an access boundary:
  the person's own password still admits them, as before any reset.
- **Known devices** get a surrogate `id` (059) so one can be forgotten without
  the page ever holding a device hash.
- **Push devices:** disabling sets `disabled_at`. A signed-in app that
  registers again re-enables its device, so the page offers "End session" for
  a lost phone and says so.
- **Calendar feeds:** revoked by row id; the feed URL stops working at once.
- **Login lock:** cleared with the limiter's `resetUsedTokens`, then read back;
  another warm server may still refuse until its own cache ages out, which
  the page says.
- **Every action needs fresh proof** and writes an audit row, like the other
  Gridmaster account actions.
- **Session IPs are not shown** (43b's decision, kept): platform, device,
  browser, app version, city and country and the dates are.

## In scope

- Record: `security` (two-factor, factors, re-enrollment, known devices) and
  `sessions` (sessions, push devices, calendar feeds) on
  `GridmasterPersonRecord`.
- Person view: the two sections with their actions.
- Routes: `POST /api/gridmaster/users/[userId]/security` (end a session,
  forget a device, disable a push device, revoke a calendar feed, clear the
  login lock) and `POST /api/gridmaster/users/[userId]/two-factor-reset`.
- The reset's notice email and in-app alert.
- Re-enrollment gates on web and mobile, and the flag in their status reads.
- F-80: the deactivate PATCH requires fresh proof, refuses a Gridmaster
  target, and the page runs it through step-up.
- F-81: person pages refresh on staff, invitation, session and profile
  changes.

## Out of scope

- Schedules, requests and notifications (43d); the combined history (43e).
- A server-side block on API calls from a person who has not re-enrolled.

## Build steps

- [x] **Step 1 - migration 059** - `profiles.mfa_reenroll_required_at` and
      `user_known_devices.id` (uuid, unique, default), with the checksum
      locked. _Done when:_ `db:migrations:check` passes and a live check reads
      both columns.
- [x] **Step 2 - the record** - `security` and `sessions` on the person
      record from Auth factors, `profiles`, `user_known_devices`,
      `user_sessions`, `mobile_device_tokens` and `calendar_feed_tokens`, each
      with an explicit column list. _Done when:_ builder tests show every
      field and that no token, hash or IP reaches the record.
- [ ] **Step 3 - the sections** - Security and Sessions and devices on the
      person view, read-only. _Done when:_ a view test shows each field, and
      empty states for a person with none.
- [ ] **Step 4 - the actions** - the security route and its five actions,
      each with fresh proof, a Gridmaster-target refusal and an audit row;
      the sections run them through step-up. _Done when:_ route tests cover
      each action, a stale session and a row that belongs to someone else; a
      view test shows a cancelled step-up changes nothing.
- [ ] **Step 5 - the two-factor reset** - the route deletes every factor,
      sets `mfa_enabled` false and the flag, ends every session, emails the
      person and writes the audit row; the page asks for a reason through
      step-up. _Done when:_ route tests cover a missing reason, a stale
      session, a Gridmaster target and the order of effects; an email render
      test covers the notice.
- [ ] **Step 6 - web re-enrollment** - `GET /api/account/mfa-status` reports
      the flag; a gate over app routes shows the enrollment screen until a
      factor is verified; `updateSelfMfaStatus(true)` clears the flag. _Done
      when:_ tests show the gate blocks and lifts, and the flag clears on
      enrollment.
- [ ] **Step 7 - mobile re-enrollment** - bootstrap carries the flag; a gate
      beside `TermsGate` sends the person to the two-factor screen. _Done
      when:_ contract and gate tests show it blocks, allows the two-factor
      screen and lifts.
- [ ] **Step 8 - F-80 and F-81** - fresh proof and a Gridmaster-target
      refusal on the deactivate PATCH, step-up on the page, and wider
      realtime invalidation. _Done when:_ route and hook tests cover both.

## Data / contracts

```ts
interface GridmasterPersonSecurity {
  twoFactor: {
    enabled: boolean;
    reenrollRequiredAt: string | null;
    factors: {
      id: string;
      type: string;
      name: string | null;
      status: string;
      createdAt: string;
      lastUsedAt: string | null;
    }[];
  };
  knownDevices: { id: string; platform: string | null; firstSeenAt: string; lastSeenAt: string }[];
}
interface GridmasterPersonSessions {
  sessions: {
    id: string;
    platform: string | null;
    deviceLabel: string | null;
    browser: string | null;
    appVersion: string | null;
    location: string | null;
    orgId: string | null;
    createdAt: string;
    lastActiveAt: string | null;
  }[];
  pushDevices: {
    id: string;
    platform: string;
    orgId: string | null;
    lastSeenAt: string | null;
    disabledAt: string | null;
    createdAt: string;
  }[];
  calendarFeeds: { id: string; orgId: string; issuedAt: string; revokedAt: string | null }[];
}
```

Load-bearing for 43d and 43e, which extend the same record.

## Testing

- Builder, route, email and view tests as listed; mobile gate and contract
  tests. Final gate: type-check, the web and mobile suites, lint, build.

## Notes for the AI

- Never select a token, hash or IP column; list columns explicitly.
- New routes join the sensitive-action and browser-mutation inventories, and
  the audit registry gets every new action.
- Production needs 059 applied by the runbook before the release that
  carries this ships.
- No em dashes.
