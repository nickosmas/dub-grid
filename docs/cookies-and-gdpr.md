# Cookies & GDPR Compliance

This document covers DubGrid's cookie implementation, consent management, analytics gating, GDPR data handling, and automated account cleanup.

---

## Table of Contents

1. [Cookie Inventory](#cookie-inventory)
2. [Consent Management](#consent-management)
3. [Analytics Gating](#analytics-gating)
4. [Authentication Cookies](#authentication-cookies)
5. [Impersonation Cookie](#impersonation-cookie)
6. [Sidebar State Cookie](#sidebar-state-cookie)
7. [Cookie Security](#cookie-security)
8. [GDPR Compliance](#gdpr-compliance)
9. [Mobile App](#mobile-app)
10. [Data Flow](#data-flow)
11. [Developer Guide](#developer-guide)

---

## Cookie Inventory

| Cookie | Type | Purpose | Duration | Set By |
|--------|------|---------|----------|--------|
| `dubgrid-cookie-consent` | Essential | Stores consent preference (essential/analytics) + version | 1 year | Client JS |
| `sb-*-auth-token` | Essential | Supabase authentication session (access + refresh tokens) | Auto-refreshed | Supabase SSR |
| `dubgrid-impersonation` | Essential | Gridmaster support impersonation session data | Up to 30 min | Client JS |
| `sidebar_state` | Essential | Remembers sidebar open/collapsed state | 7 days | Client JS |
| PostHog cookies | Analytics | Product analytics session tracking | Varies | PostHog SDK |
| Vercel Analytics | Analytics | Web performance metrics (Core Web Vitals) | Varies | Vercel SDK |
| Sentry Session Replay | Analytics | Privacy-masked session replay for bug reproduction (consent-gated; error monitoring is separate and always on) | Varies | Sentry SDK |

---

## Consent Management

### Overview

DubGrid uses a two-tier consent model: **essential** (always on) and **analytics** (opt-in). A banner prompts users on first visit or when the consent version changes.

### Components

- **`apps/web/src/components/CookieConsent.tsx`** — Consent banner (summary + inline "Customize" view) and the shared `setCookieConsent()` / `openConsentPreferences()` helpers
- **`apps/web/src/app/cookie-policy/CookiePreferencesManager.tsx`** — On-page preference toggle (reuses `setCookieConsent`)
- **`apps/web/src/app/api/consent/route.ts`** — Server-side consent recording endpoint
- **`cookie_consents` table** — Append-only audit trail in the database

The footers (landing page, auth flows, request-demo) and the Profile → Privacy & data card expose a **Cookie preferences** control that dispatches the `dubgrid:open-consent` event, re-opening the banner in its Customize view from anywhere.

### Cookie Format

```json
{
  "essential": true,
  "analytics": true,
  "version": "1.1"
}
```

Stored as: `dubgrid-cookie-consent={url-encoded JSON}; expires={1 year}; path=/; SameSite=Lax; Secure`

### Consent Flow

```
User visits app
  → CookieConsent.tsx mounts
  → Reads dubgrid-cookie-consent cookie
  → Missing OR version !== CONSENT_VERSION?
      → Show banner ("Customize" / "Essential only" / "Accept all")
      → "Customize" reveals per-category toggles + "Save preferences"
  → User chooses:
      1. setCookieConsent(analytics) — writes cookie + localStorage with version
      2. syncConsentToServer() — POSTs to /api/consent (fire-and-forget)
      3. Dispatches CONSENT_CHANGED_EVENT — live consumers react (PostHog,
         Sentry Session Replay, the on-page preferences manager) without a reload
  → Consent exists and version is current?
      → Banner hidden; re-open via any "Cookie preferences" link
        (footers + Profile → Privacy & data) which fires dubgrid:open-consent
```

### Consent Withdrawal

Users can change their preference at any time via any **Cookie preferences** control (footers + Profile → Privacy & data) or the on-page manager at `/cookie-policy`. Switching from "Accept all" to "Essential only":

1. Updates the cookie + localStorage
2. Records the change server-side
3. Fires `CONSENT_CHANGED_EVENT`; analytics consumers tear down in place (no reload required)

### Server-Side Audit Trail

`POST /api/consent` records every consent decision:

- **Input validation:** Zod schema — `{consent: {essential: true, analytics: boolean}, version: string}`
- **IP handling:** SHA-256 hash of `x-forwarded-for` (never stores raw IP)
- **Authentication:** Optional — works for both authenticated and anonymous visitors
- **Storage:** Inserts into `cookie_consents` table (append-only, never updated or deleted)

Database schema:
```sql
cookie_consents (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID,          -- nullable (anonymous visitors)
  ip_hash         TEXT NOT NULL,  -- SHA-256 of IP
  consent         JSONB NOT NULL, -- {essential: true, analytics: boolean}
  consent_version TEXT,           -- e.g. "1.0"
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

RLS policies:
- Authenticated users can insert their own records and read their own records
- Anonymous visitors can insert records with `user_id = NULL`
- Gridmasters can read all records

### Version Invalidation

When the cookie or privacy policy changes, bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx`:

```typescript
// IMPORTANT: Bump this version when cookies, analytics providers, or the
// cookie/privacy policy change. A new version re-prompts all users to re-consent.
const CONSENT_VERSION = "1.1";
```

All users with the old version in their cookie will see the consent banner on their next page load. The re-prompt is automatic once the version is bumped. Keep the mobile constant (`apps/mobile/src/features/consent/lib/consent.ts`) in lockstep so both platforms re-prompt together.

> Version `1.1` introduced consent-gating for Sentry Session Replay.

---

## Analytics Gating

Both analytics services are **blocked by default** and only initialized after explicit user consent.

### PostHog

**Component:** `apps/web/src/components/PostHogProvider.tsx`

```
PostHogProvider mounts
  → useEffect reads dubgrid-cookie-consent cookie directly
  → analytics !== true? → return (no initialization)
  → analytics === true? → initPostHog()
      → posthog.init() with:
          capture_pageview: true
          capture_pageleave: true
          autocapture: false (manual events only)
          persistence: "localStorage+cookie"
  → On auth change: identifyUser(userId, {email}) or resetPostHog()
```

**Configuration:** `apps/web/src/lib/posthog.ts`
- Env vars: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- Exports: `initPostHog()`, `identifyUser()`, `resetPostHog()`, `captureEvent()`, `getFeatureFlag()`

**Server-side:** No dedicated server-side PostHog wrapper is currently used in app code. Analytics initialization and feature flag reads run through the client-side helpers in `apps/web/src/lib/posthog.ts`.

### Vercel Analytics

**Component:** `apps/web/src/components/ConsentGatedAnalytics.tsx`

```typescript
export default function ConsentGatedAnalytics() {
  const [hasConsent] = useState(() => getCookieConsent()?.analytics === true);
  if (!hasConsent) return null;
  return <Analytics />;
}
```

Uses a lazy `useState` initializer to read consent once on mount. No consent = no `<Analytics />` component rendered = no scripts loaded.

### Sentry (Error Monitoring always-on; Session Replay consent-gated)

Sentry has two distinct features with different consent treatment:

- **Error monitoring** runs as an essential/operational service. It is **not** gated behind consent because it's necessary for application reliability. Client, server, and edge runtimes all initialize unconditionally.
- **Session Replay** records user sessions, so it **is** gated behind analytics consent. In `apps/web/src/instrumentation-client.ts` the client SDK initializes with the replay integration only when analytics consent already exists; otherwise it starts in error-only mode and attaches replay lazily via `Sentry.addIntegration(replayIntegration())` the moment the user opts in (listening on `CONSENT_CHANGED_EVENT`), with no page reload.

**Key safety measure:** `sendDefaultPii: false` across all Sentry configs. No emails, IPs, or user identifiers are sent to Sentry — only stack traces and request metadata.

### Layout Integration

All providers are composed in `apps/web/src/app/layout.tsx`:

```tsx
<body>
  <AuthProvider>
    <PostHogProvider>           {/* checks consent internally */}
      <QueryProvider>
        <TermsAcceptanceGate>
          ...children...
        </TermsAcceptanceGate>
      </QueryProvider>
    </PostHogProvider>
  </AuthProvider>
  <CookieConsent />             {/* banner + settings button */}
  <ConsentGatedAnalytics />     {/* only renders <Analytics/> with consent */}
</body>
```

---

## Authentication Cookies

Managed entirely by `@supabase/ssr`. DubGrid does not set or modify these cookies directly.

### Cookie Details

- **Name:** `sb-<project-ref>-auth-token` (may be chunked: `.0`, `.1`, etc. for large JWTs)
- **Flags:** `HttpOnly`, `Secure`, `SameSite=Strict` (set automatically by Supabase)
- **Contents:** Access token (JWT) + refresh token

### Custom JWT Claims

The `custom_access_token_hook` function (in `002_functions_triggers.sql`) runs on every token issue/refresh and sets top-level JWT claims:

| Claim | Description |
|-------|-------------|
| `platform_role` | `gridmaster` or `none` |
| `org_role` | `super_admin`, `admin`, or `user` |
| `org_id` | Current organization UUID |
| `org_slug` | Current organization slug |

The hook also updates `profiles.last_sign_in_at` (debounced to 5-minute intervals) for GDPR account cleanup tracking.

### Middleware Processing

`apps/web/middleware.ts` processes auth cookies on every request:

1. Creates a Supabase server client from request cookies
2. Calls `supabase.auth.getSession()` to read the session
3. Verifies JWT signature via JWKS endpoint (ES256)
4. Extracts custom claims (platform_role, org_role, org_id, org_slug)
5. Enforces route-level RBAC (admin+ routes, gridmaster routes)
6. Sets verified role headers on the response (`x-dubgrid-role`, `x-dubgrid-org-id`, `x-dubgrid-org-slug`)
7. The `setAll()` callback allows Supabase to refresh expired cookies automatically

**Fallback:** If `jwtVerify` fails (can happen in production), middleware falls back to `decodeJwt` (unverified) for non-gridmaster users. RLS is the real security boundary. Gridmasters are blocked from unverified tokens.

---

## Impersonation Cookie

Allows gridmasters to view the app as another user for support/debugging purposes.

### Cookie Details

- **Name:** `dubgrid-impersonation`
- **Flags:** `path=/; SameSite=Lax; Secure`
- **Duration:** Dynamic `max-age` based on session expiry (up to 30 minutes)
- **Library:** `apps/web/src/lib/impersonation.ts`

### Payload

```typescript
{
  sessionId: string,        // DB impersonation_sessions.id
  targetUserId: string,     // user being impersonated
  targetOrgId: string,
  targetOrgSlug: string,
  targetOrgRole: string,
  targetEmail: string,
  targetOrgName: string,
  justification: string,    // audit trail reason
  expiresAt: string         // ISO timestamp
}
```

### Middleware Handling

```
Request arrives
  → middleware reads dubgrid-impersonation cookie
  → getImpersonationFromCookie() parses + validates required fields
  → Expired? → clear cookie, continue as normal user
  → Navigating to /gridmaster? → clear cookie (end impersonation)
  → Valid? → override role headers with target user's context
```

### Functions

- `setImpersonationCookie(data)` — sets the cookie (client-side)
- `clearImpersonationCookie()` — clears the cookie (client-side)
- `getImpersonationFromCookie(cookieString)` — parses from raw cookie string (works in both Edge middleware and browser)

---

## Sidebar State Cookie

A simple preference cookie for UI state.

- **Name:** `sidebar_state`
- **Value:** `true` or `false`
- **Flags:** `path=/; max-age=604800; SameSite=Lax; Secure`
- **Duration:** 7 days
- **Set by:** `apps/web/src/components/ui/sidebar.tsx` when the user toggles the sidebar

---

## Cookie Security

### Security Flags Matrix

| Cookie | Secure | HttpOnly | SameSite |
|--------|--------|----------|----------|
| `dubgrid-cookie-consent` | Yes | No (client reads) | Lax |
| `sb-*-auth-token` | Yes (auto) | Yes (auto) | Strict (auto) |
| `dubgrid-impersonation` | Yes | No (client reads) | Lax |
| `sidebar_state` | Yes | No (client reads) | Lax |

### Notes

- **`Secure` flag:** All custom cookies include `Secure`. Modern browsers ignore this on `localhost`, so local development is unaffected.
- **`HttpOnly`:** Only Supabase auth cookies are `HttpOnly` — the others need to be readable by client JavaScript for their respective functionality.
- **`SameSite=Lax`:** Appropriate for same-site navigation. Auth cookies use `Strict` for maximum CSRF protection.

### Security Headers

`apps/web/next.config.ts` sets security headers on all responses:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## GDPR Compliance

### Consent Audit Trail

Every consent decision is recorded in the `cookie_consents` table (see [Consent Management](#consent-management)). The table is append-only — each change creates a new row with a timestamp, providing a complete history of user consent.

### Data Export (Article 20 — Right to Portability)

**Endpoint:** `GET /api/auth/data-export`
**File:** `apps/web/src/app/api/auth/data-export/route.ts`

Downloads all user data as a JSON file:

| Data | Source Table |
|------|-------------|
| Profile | `profiles` |
| Organization memberships | `organization_memberships` |
| Linked employee records | `employees` (where `user_id` matches) |
| Shift assignments | `shifts` (for linked employees, limit 5000) |
| Audit log | `audit_log` (where `actor_id` matches, limit 1000) |
| Cookie consent records | `cookie_consents` |
| Terms acceptances | `terms_acceptances` |
| Notification preferences | `notification_preferences` |

**Rate limiting:** One export per hour, enforced by checking `audit_log` for recent `data.exported` entries.

**Response:** JSON file with `Content-Disposition: attachment` header and `Cache-Control: no-store`.

### Data Erasure (Article 17 — Right to be Forgotten)

**Endpoint:** `POST /api/auth/gdpr-erase`
**Confirmation:** Requires `{ confirmation: "ERASE MY DATA" }` in request body.

Calls `gdpr_erase_user_data(p_user_id)` RPC which:

1. Anonymizes profile → "Deleted User"
2. Removes organization memberships
3. Anonymizes linked employee records (clears PII, keeps structure)
4. Strips email from audit log entries
5. Deletes notifications and notification preferences
6. Deletes user sessions
7. Deletes terms acceptances
8. Anonymizes role change log entries
9. (API endpoint) Deletes auth user

**Safety checks:** Gridmasters cannot self-erase. The function anonymizes rather than deletes — employee records and audit trails are preserved without PII.

### Account Deletion

**Endpoint:** `DELETE /api/auth/delete-account`
**Confirmation:** Requires `{ confirmation: "DELETE MY ACCOUNT" }` in request body.

Similar to GDPR erasure but with additional checks:
- Prevents gridmaster self-deletion
- Prevents sole super_admin from deleting (must transfer ownership first)

### Automated Account Cleanup

Inactive accounts are handled by two SQL functions:

**`flag_inactive_accounts(retention_days INT DEFAULT 730)`**
- Finds profiles where `last_sign_in_at` is older than `retention_days` (default: 2 years)
- Skips gridmasters and already-flagged accounts
- Sets `scheduled_deletion_at = NOW() + 30 days` (grace period)
- Sets `deactivation_warned_at = NOW()`
- Returns count of flagged accounts

**`purge_scheduled_accounts()`**
- Finds profiles where `scheduled_deletion_at <= NOW()`
- Skips gridmasters
- Calls `gdpr_erase_user_data()` for each
- Returns count of purged accounts
- **Does NOT delete auth.users** — the calling endpoint or cron handler must call `auth.admin.deleteUser` separately

**Sign-in tracking:** The `custom_access_token_hook` updates `profiles.last_sign_in_at` on every token refresh, debounced to 5-minute intervals to avoid excessive writes.

**Usage:** These functions are designed to be called by a cron job or triggered manually by a gridmaster. They are not automatically scheduled.

### Privacy & Cookie Policy Pages

- **Privacy Policy:** `apps/web/src/app/privacy/page.tsx` — discloses all data collection, third-party processors (Supabase, Vercel, PostHog, Sentry, Stripe), and user rights
- **Cookie Policy:** `apps/web/src/app/cookie-policy/page.tsx` — full cookie inventory with names, purposes, durations, and categories (essential vs analytics)

Both are linked from the consent banner.

---

## Mobile App

The Expo app (`apps/mobile`) ships **no analytics or tracking SDKs today** and uses native Supabase tokens rather than browser cookies, so there is nothing to track until a telemetry SDK is added. The consent surface is in place anticipatorily and mirrors the web model.

### Consent gate

- **`apps/mobile/src/features/consent/lib/consent.ts`** — `getStoredConsent()` / `setStoredConsent()` persist `{ essential, analytics, version }` to `expo-secure-store` under the same `dubgrid-cookie-consent` key and `CONSENT_VERSION` as web. `syncConsentToServer()` POSTs to the web `/api/consent` endpoint (fire-and-forget). Because that route authenticates via cookies and is CSRF-origin protected, the native request sends an `Origin` header on the same root domain and is recorded as an anonymous row tagged with the mobile user-agent.
- **`apps/mobile/src/features/consent/components/ConsentGate.tsx`** — a non-dismissable first-launch sheet (Accept all / Essential only) wrapped around the app in `app/_layout.tsx`. Re-prompts only when the stored version is stale.
- **Profile → Privacy & data** (`ProfileScreen.tsx` section + `ProfilePrivacyScreen.tsx`) links out to the web Privacy / Terms / Cookie pages and exposes an analytics toggle that reuses `setStoredConsent()`.

### App Tracking Transparency (ATT)

`expo-tracking-transparency` is installed and configured (`NSUserTrackingUsageDescription` + plugin in `app.json`). `requestTrackingPermissionIfNeeded()` in `consent.ts` is **scaffolding only — not yet called**, because no SDK uses the IDFA today. When PostHog/Sentry (or any tracking SDK) ships on mobile, call it on iOS 14.5+ immediately before initializing that SDK, gated on the user's analytics consent.

---

## Data Flow

```
Browser                          Server                         Database
───────                          ──────                         ────────

Visit app ──────────────────────────────────────────────────────►
  ◄─── HTML + CookieConsent.tsx

Read dubgrid-cookie-consent
  missing/stale version? → show banner

User clicks "Accept all"
  ├─ write cookie (client)
  ├─ POST /api/consent ────────► validate + hash IP ───────────► INSERT cookie_consents
  ├─ initPostHog()
  └─ reload()

Page reloads
  ├─ ConsentGatedAnalytics
  │   reads cookie → analytics:true → render <Analytics/>
  ├─ PostHogProvider
  │   reads cookie → analytics:true → initPostHog()
  └─ CookieConsent
      reads cookie → version current → render settings icon

Sign in ───────────────────────► Supabase auth ────────────────► auth.users
  ◄─── sb-*-auth-token cookies   custom_access_token_hook ─────► UPDATE profiles.last_sign_in_at
                                  sets JWT claims

Navigate ──────────────────────► apps/web/middleware.ts
                                  read auth cookie
                                  verify JWT
                                  read impersonation cookie
                                  enforce RBAC
  ◄─── response + refreshed cookies

Data export ───────────────────► GET /api/auth/data-export
                                  verify session
                                  rate limit check ────────────► SELECT audit_log
                                  query all user data ─────────► SELECT profiles, memberships,
                                                                  employees, shifts, consents, ...
                                  log export ──────────────────► INSERT audit_log
  ◄─── JSON file download
```

---

## Developer Guide

### When to bump consent version

Bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx` when:
- Adding or removing cookies
- Adding or removing analytics/tracking services
- Changing what data a cookie stores
- Updating the cookie policy or privacy policy content

### Adding a new cookie

1. Set the cookie with `SameSite=Lax; Secure` flags
2. Add it to the cookie inventory table in `apps/web/src/app/cookie-policy/page.tsx`
3. If it's non-essential, gate it behind `getCookieConsent()?.analytics`
4. Bump `CONSENT_VERSION`

### Adding a new third-party service

1. If it sets cookies or collects data, gate it behind analytics consent
2. Add it to the "Third-Party Data Processors" section in `apps/web/src/app/privacy/page.tsx`
3. Add it to the appropriate table in `apps/web/src/app/cookie-policy/page.tsx`
4. Bump `CONSENT_VERSION`
5. If it processes data server-side, execute a DPA with the provider

### Testing consent flow

1. Clear all cookies in DevTools (Application > Cookies)
2. Reload — consent banner should appear
3. Click "Essential only" — verify no PostHog/Vercel Analytics in Network tab
4. Open settings (cookie icon, bottom-left) → "Accept all" — verify analytics scripts load after reload
5. Check `cookie_consents` table for audit records

### Key files

| File | Purpose |
|------|---------|
| `apps/web/src/components/CookieConsent.tsx` | Consent banner, cookie read/write, version check, server sync |
| `apps/web/src/components/ConsentGatedAnalytics.tsx` | Wraps `<Analytics />` behind consent |
| `apps/web/src/components/PostHogProvider.tsx` | PostHog initialization gated on consent |
| `apps/web/src/app/api/consent/route.ts` | Records consent to DB (POST) |
| `apps/web/src/app/api/auth/data-export/route.ts` | GDPR data export (GET) |
| `apps/web/src/app/api/auth/gdpr-erase/route.ts` | GDPR data erasure (POST) |
| `apps/web/src/app/api/auth/delete-account/route.ts` | Account deletion (DELETE) |
| `apps/web/src/lib/posthog.ts` | PostHog client initialization and helpers |
| `apps/web/src/lib/impersonation.ts` | Impersonation cookie utilities |
| `apps/web/src/components/ui/sidebar.tsx` | Sidebar state cookie |
| `apps/web/src/app/cookie-policy/page.tsx` | Public cookie policy page |
| `apps/web/src/app/privacy/page.tsx` | Public privacy policy page |
| `apps/web/src/instrumentation-client.ts` | Sentry client config (sendDefaultPii: false) |
| `apps/web/sentry.server.config.ts` | Server-side Sentry bootstrap |
| `apps/web/sentry.edge.config.ts` | Edge runtime Sentry bootstrap |
| `supabase/migrations/001_schema.sql` | cookie_consents + profiles schema |
| `supabase/migrations/002_functions_triggers.sql` | Auth hook, flag/purge functions |
| `supabase/migrations/003_rls_policies.sql` | cookie_consents RLS policies |
| `apps/web/middleware.ts` | Auth cookie verification, impersonation handling, RBAC |
