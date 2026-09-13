# MFA provider boundary qualification

Feature: 19d2, Steps 3 and 4c1. Checked on 2026-09-11 against the hosted DubGrid
project `xpoylacxkbphnudsupuu.supabase.co` with explicitly authorized disposable
Auth users. No production configuration was changed.

## Confirmed results

| Request                                                     | Result                       | Verified factor afterward |
| ----------------------------------------------------------- | ---------------------------- | ------------------------- |
| Independent password-only session, never verified with TOTP | HTTP 422, `insufficient_aal` | Preserved                 |
| Fresh session after successful TOTP verification            | HTTP 200                     | Removed                   |
| Old AAL1 token belonging to that same, now-promoted session | HTTP 200                     | Removed                   |
| Refreshed AAL2 session with TOTP proof aged 312 seconds     | HTTP 200                     | Removed                   |

The earlier conclusion that password-only sessions could disable MFA was
incorrect. It confused the old token's AAL claim with the current state of
the same session in Supabase Auth. The independent-session controls corrected
that interpretation. The current provider boundary requires an MFA-verified
session; it does not enforce DubGrid's five-minute proof age for removal.

## Timed test controls

The final run completed at `2026-09-11T18:10:21.934Z`:

1. Create a uniquely named disposable user through Auth Admin.
2. Sign in, enroll TOTP, and verify it. Confirm AAL2 and a TOTP AMR timestamp.
3. Sign in separately with the password, using an isolated client. Assert a
   different `session_id`, AAL1, and rejection of verified-factor removal.
4. Wait 310 seconds using a monotonic clock, without verifying TOTP again.
5. Refresh the verified session. Assert the same session ID and unchanged
   TOTP AMR timestamp. The proof was 312 seconds old before removal.
6. Repeat the independent password-only control. Supabase returned HTTP 422
   with `insufficient_aal`; an Auth Admin read confirmed the factor remained
   verified.
7. Send a raw HTTP DELETE to `/auth/v1/factors/{id}` using only the publishable
   key and refreshed user token. Supabase returned HTTP 200; an Auth Admin
   read confirmed the factor was absent.
8. Delete the disposable user in cleanup. Confirm absence with an Auth Admin
   lookup returning HTTP 404.

Admin credentials were used only for disposable-user setup, factor-state
inspection, and cleanup, never for the factor-removal requests. Tokens,
passwords, keys, TOTP codes, and factor secrets were not included in output.

The existing shared assurance suite passed 47 tests. The web and mobile
authentication-helper suites passed 59 tests. These validate DubGrid helpers,
not enforcement at the public Supabase endpoint, and do not establish that
all sensitive product routes have been integrated yet.

## Provider controls reviewed

Supabase's [user model](https://github.com/supabase/auth/blob/v2.187.0/internal/models/user.go)
marks `factors` as `omitempty`: a successful live user lookup with no factors
can omit that field. DubGrid normalizes only that omitted value to an empty
factor set, after authenticating the live user. Null, non-array, or malformed
factor entries still fail closed. This is not a fallback for a failed lookup.

Supabase's `UnenrollFactor` implementation checks `session.IsAAL2()` for a
verified factor. `IsAAL2()` compares the session's AAL value; the removal
handler has no proof-age check. This was present in both the inspected
`v2.187.0` source and the current master source. The hosted version was not
independently identified; the hosted behavioral test is the evidence for it.

The documented hook list provides MFA verification hooks, but no factor-removal
hook. No dedicated MFA-removal freshness setting was found in the inspected
hosted configuration or documentation. Whole-session expiry and token expiry
are different controls and do not establish a per-action proof-age guarantee.

Sources:

- [Supabase unenrollment API](https://supabase.com/docs/reference/javascript/auth-mfa-unenroll)
- [Supabase Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Factor-removal implementation](https://github.com/supabase/auth/blob/v2.187.0/internal/api/mfa.go)
- [Session assurance implementation](https://github.com/supabase/auth/blob/v2.187.0/internal/models/sessions.go)

## Approved decision (2026-09-11)

The user approved scoping the five-minute server guarantee to DubGrid-controlled sensitive-action
endpoints. Keep a fresh authenticator challenge immediately before disabling
MFA through the web or mobile UI. Explicitly document that direct Supabase
factor removal requires an MFA-verified session but can bypass DubGrid's
five-minute rule. A stolen, already-verified session therefore retains this
direct-provider capability beyond five minutes.

Under that revised contract, finish Step 3 with authenticated, server-side
factor reconciliation, correct promoted-session use, pending-factor cleanup,
and matching web/mobile behavior. Provider APIs remain subject to their own
verified policies; other credential mutations still need their own qualification.

If five-minute enforcement must also cover direct Supabase calls, this requires
a provider-supported enforcement change or an architecture that prevents those
calls from bypassing the application. An app preflight, an API wrapper alone,
or a client prompt cannot supply that guarantee. This acceptance alone does not
complete Step 3; its implementation must also be verified. It is limited to the
MFA provider boundary, not an exemption for other credential mutations.

## DubGrid lifecycle implementation

Web uses `POST /api/account/mfa-lifecycle` with its existing CSRF protection.
Mobile uses `POST /api/mobile/v1/profile/mfa-lifecycle` with its existing
bearer, account and organization checks. Both delegate to the same handler:

- `enroll` and `remove` require the canonical five-minute sensitive-action
  policy before a user-token-scoped provider mutation. No Auth Admin factor
  mutation or service-role factor removal is used.
- `reauthenticate` derives the email from the live authenticated account,
  rejects password-only step-up when a verified TOTP factor exists, and returns
  a replacement session only after confirming the same user and original
  signed organization. Failed replacements discard their own new session;
  they do not sign out the caller's original session.
- `cleanup` only accepts a factor belonging to the live user whose status is
  still unverified. A verified factor is not removed by a Cancel request.
  Provider verification and cancellation are not an atomic provider operation:
  both UIs additionally suppress cleanup while verification is in flight, and
  stop treating a factor as pending as soon as verification succeeds or its
  outcome becomes unknown after a timeout.
- Both apps request a fresh authenticator challenge before removal and use
  the exact promoted session token for subsequent mutation and reconciliation.
  A mutation or status-write failure offers explicit status refresh instead of
  automatically replaying factor removal or claiming an optimistic boolean.

Automated route and component tests cover these app-owned boundaries. A test
using the installed, unmocked Supabase SDK with intercepted HTTP also confirms
that token-scoped factor calls forward the user token without a stored session.
These tests are not new hosted-provider qualification or native-device evidence.

## Credential mutation qualification

The checked-in local Auth configuration enables secure password change and
double-confirmed email changes. Supabase documents secure password change as a
provider-controlled 24-hour recent-login window that can require an emailed
reauthentication nonce. That is independent of DubGrid's five-minute password
or TOTP policy. Double-confirmed email changes prove control of the old and new
mailboxes; they do not establish a fresh human-authentication timestamp.

The web credential editors therefore call
`POST /api/account/credential-assurance` immediately before the public
Supabase `updateUser` mutation. That endpoint selects password or TOTP from
live factor state and enforces the canonical five-minute window. Profile,
contact, and work fields are not persisted before this assurance check passes,
and an ambiguous provider mutation is never automatically replayed.

This preflight governs DubGrid's UI; it is not a security boundary around a
client that already possesses a Supabase session. Direct calls to the public
Supabase email or password update API remain subject to Supabase's provider
rules rather than DubGrid's stricter five-minute window. Closing that gap would
require a provider-supported hook or an architecture that prevents clients
from invoking the public credential mutation directly.

Sources:

- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase `updateUser`](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Supabase `reauthenticate`](https://supabase.com/docs/reference/javascript/auth-reauthenticate)
