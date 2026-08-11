# Cookies & GDPR Compliance

This document covers DubGrid's cookie implementation, consent management, analytics gating, GDPR data handling, and automated account cleanup.

---

## Table of Contents

1. [Cookie Inventory](#cookie-inventory)
2. [Consent Management](#consent-management)
3. [Analytics Gating](#analytics-gating)
4. [Authentication Cookies](#authentication-cookies)
5. [Sandbox Cookie](#sandbox-cookie)
6. [Impersonation Cookie](#impersonation-cookie)
7. [Sidebar State Cookie](#sidebar-state-cookie)
8. [Theme Preference Cookie](#theme-preference-cookie)
9. [Cookie Security](#cookie-security)
10. [GDPR Compliance](#gdpr-compliance)
11. [Mobile App](#mobile-app)
12. [Data Flow](#data-flow)
13. [Developer Guide](#developer-guide)

---

## Cookie Inventory

| Cookie                        | Category  | Purpose                                                                                                                                                              | Duration                   | Set By                                     |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------ |
| `dubgrid-cookie-consent`      | Essential | Stores consent preference (essential/analytics) + version. Also mirrored in `localStorage` for localhost reliability.                                                | 1 year                     | Client JS (`CookieConsent.tsx`)            |
| `sb-<project-ref>-auth-token` | Essential | Supabase authentication session (access + refresh tokens). May be chunked into `.0`, `.1`, etc. for large JWTs.                                                      | ~400 days (auto-refreshed) | `@supabase/ssr`                            |
| `dubgrid-sandbox`             | Essential | Activates Test Sandbox mode for the calling user. `HttpOnly`, read and written server-side only.                                                                     | 7 days (cleared on exit)   | Server Route Handler (`/api/test-sandbox`) |
| `dubgrid-impersonation`       | Essential | Gridmaster support impersonation session data.                                                                                                                       | Dynamic, up to 30 min      | Client JS (`impersonation.ts`)             |
| `sidebar_state`               | Essential | Remembers sidebar open/collapsed state.                                                                                                                              | 7 days                     | Client JS (`ui/sidebar.tsx`)               |
| `dg-theme`                    | Essential | Light/dark/system appearance preference, shared across the apex and org subdomains. Domain-scoped, so it has no effect on localhost — see `lib/theme-preference.ts`. | 1 year                     | Client JS (`ThemeProvider.tsx`)            |
| PostHog cookies               | Analytics | Product analytics session tracking (consent-gated).                                                                                                                  | Varies (PostHog-managed)   | PostHog SDK                                |
| Vercel Analytics              | Analytics | Web performance metrics (consent-gated).                                                                                                                             | Varies (Vercel-managed)    | `@vercel/analytics`                        |
| Sentry Session Replay         | Analytics | Privacy-masked session replay for bug reproduction (consent-gated). Error monitoring itself is always-on and sets no additional cookies.                             | Varies (Sentry-managed)    | Sentry SDK                                 |

---

## Consent Management

### Overview

DubGrid uses a two-tier consent model: **essential** (always on) and **analytics** (opt-in). A bottom-bar banner prompts users on first visit or when the consent version changes.

### Components

- **`apps/web/src/components/CookieConsent.tsx`** — Consent banner (summary + inline "Customize" view), the `setCookieConsent()` / `openConsentPreferences()` helpers, and the `CONSENT_VERSION` constant. Also exports `subscribeToConsentChanges` and `getAnalyticsConsentSnapshot` so live consumers can react without a reload.
- **`apps/web/src/app/cookie-policy/CookiePreferencesManager.tsx`** — On-page preference toggle embedded in `/cookie-policy`. Reuses `setCookieConsent()` and `getCookieConsent()` directly (does not dispatch `dubgrid:open-consent`).
- **`apps/web/src/app/api/consent/route.ts`** — Server-side consent recording endpoint.
- **`cookie_consents` table** — Append-only audit trail in the database.

The landing-page footer, auth-flow footer, request-demo footer, and Profile > Privacy & data card each expose a **Cookie preferences** control. Clicking it dispatches the `dubgrid:open-consent` event, which re-opens the banner in its Customize view without a page reload.

### Cookie Format

```json
{
  "essential": true,
  "analytics": true,
  "version": "1.2"
}
```

Stored as:

- **Cookie:** `dubgrid-cookie-consent={url-encoded JSON}; expires={1 year}; path=/{domain suffix}; SameSite=Lax[; Secure]`
  - `domain` is omitted on `localhost` (subdomain cookies are unreliable there).
  - In production, the root domain is used (e.g. `.dubgrid.com`) so the preference is readable across all subdomains.
  - `Secure` is omitted on plain HTTP (localhost dev), present on HTTPS.
- **`localStorage`:** Same JSON under the same `dubgrid-cookie-consent` key. Serves as a fallback for localhost where subdomain cookies are unreliable.

### Consent Version

```typescript
// apps/web/src/components/CookieConsent.tsx
// IMPORTANT: Bump this version when cookies, analytics providers, or the
// cookie/privacy policy change. A new version re-prompts all users to re-consent.
const CONSENT_VERSION = "1.2";
```

**Current version: `"1.2"`**

Version history:

- `1.1` — Sentry Session Replay moved behind analytics consent; error monitoring stays always-on.
- `1.2` — Added the essential `dg-theme` cookie for cross-subdomain appearance preference.

The mobile app (`apps/mobile/src/features/consent/lib/consent.ts`) mirrors this constant. Bump both in lockstep so both platforms re-prompt together when the policy changes.

### Consent Flow

```
User visits app
  → CookieConsent.tsx mounts (server snapshot: false; client: real value)
  → Reads dubgrid-cookie-consent cookie (falls back to localStorage on localhost)
  → Missing OR version !== CONSENT_VERSION?
      → Show banner ("Customize" / "Essential only" / "Accept all")
      → "Customize" reveals per-category toggles + "Save preferences"
  → User chooses:
      1. setCookieConsent(analytics) — writes cookie + localStorage with version
      2. syncConsentToServer() — POSTs to /api/consent (fire-and-forget)
      3. Dispatches dubgrid:consent-changed — live consumers react without reload
         (PostHog via useSyncExternalStore, Sentry Session Replay via direct listener,
          ConsentGatedAnalytics via useSyncExternalStore)
  → Consent exists and version is current?
      → Banner hidden; re-open via any "Cookie preferences" link
        (footers + Profile > Privacy & data) which fires dubgrid:open-consent
```

### Consent Withdrawal

Users can change their preference at any time via:

- Any **Cookie preferences** link (landing footer, auth footer, request-demo footer, Profile > Privacy & data)
- The on-page toggle at `/cookie-policy`

Switching from "Accept all" to "Essential only":

1. Updates the cookie + localStorage
2. Records the change server-side (`/api/consent`)
3. Fires `dubgrid:consent-changed`; PostHog, Sentry Session Replay, and Vercel Analytics all respond in place (no reload required)

### Server-Side Audit Trail

`POST /api/consent` records every consent decision:

- **Input validation:** Zod schema: `{ consent: { essential: true, analytics: boolean }, version: string }`
- **IP handling:** SHA-256 hash of `x-forwarded-for` (raw IP is never stored)
- **Authentication:** Optional; works for authenticated users and anonymous visitors
- **Storage:** Inserts into `cookie_consents` (append-only, never updated or deleted)

Database schema:

```sql
cookie_consents (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID,                                                  -- NULL for anonymous visitors
  ip_hash         TEXT NOT NULL,                                         -- SHA-256 of IP
  consent         JSONB NOT NULL DEFAULT '{"essential": true, "analytics": false}',
  consent_version TEXT,                                                  -- e.g. "1.1"
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

RLS policies:

- Authenticated users can insert their own records and read their own records.
- Anonymous visitors can insert records with `user_id = NULL`.
- Gridmasters can read all records.

### When to Bump CONSENT_VERSION

Bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx` (and mirror the value in `apps/mobile/src/features/consent/lib/consent.ts`) whenever:

- A cookie is added or removed
- An analytics or tracking service is added or removed
- What a cookie stores changes materially
- The cookie policy or privacy policy content changes

All users with the old version stored in their cookie or localStorage will see the consent banner on their next page load. The re-prompt is automatic.

---

## Analytics Gating

All three analytics/tracking integrations are **blocked by default** and only activate after explicit user consent.

### PostHog

**Component:** `apps/web/src/components/PostHogProvider.tsx`  
**Config:** `apps/web/src/lib/posthog.ts`  
**Env vars:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`

`PostHogProvider` uses `useSyncExternalStore` (subscribing to `subscribeToConsentChanges`) so it reacts live to consent changes without a reload. When consent is granted, it calls `enablePostHog()` (which calls `initPostHog()` then `posthog.opt_in_capturing()`). When consent is revoked, it calls `disablePostHog()` (`posthog.opt_out_capturing()` + `posthog.reset()`).

PostHog is initialized with:

```typescript
posthog.init(key, {
  api_host: host,
  capture_pageview: true,
  capture_pageleave: true,
  persistence: "localStorage+cookie",
  autocapture: false, // manual events only
});
```

No server-side PostHog wrapper is used today. Analytics and feature flag reads run through the client-side helpers in `apps/web/src/lib/posthog.ts`.

### Vercel Analytics

**Component:** `apps/web/src/components/ConsentGatedAnalytics.tsx`

Uses `useSyncExternalStore` (same `subscribeToConsentChanges` subscription) to reactively render `<Analytics />` only when analytics consent is active. No consent means the `@vercel/analytics` script is never loaded.

### Sentry (Error Monitoring always-on; Session Replay consent-gated)

**Files:** `apps/web/src/instrumentation-client.ts` (client), `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`

Sentry has two distinct features with separate consent treatment:

- **Error monitoring** is an operational necessity. Client, server, and edge runtimes initialize unconditionally (when `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` is set). It is not gated on analytics consent.
- **Session Replay** records user sessions and is gated on analytics consent. In `instrumentation-client.ts`:
  - If analytics consent already exists at page load, `replayIntegration()` is included in `init()` up front.
  - Otherwise, the SDK starts in error-only mode, and a `subscribeToConsentChanges` listener attaches `replayIntegration()` the moment the user opts in, with no page reload required.

`sendDefaultPii: false` is set in all three Sentry configs. No emails, IPs, or user identifiers are sent to Sentry.

Browser extension errors are filtered by a `beforeSend` hook in the client config.

### Layout Integration

All providers and consent-gated scripts are composed in `apps/web/src/app/layout.tsx`:

```tsx
<body>
  <AuthProvider>
    <PostHogProvider>
      {" "}
      {/* consent-reactive via useSyncExternalStore */}
      <QueryProvider>
        <TermsAcceptanceGate>
          <OnboardingGate>...children...</OnboardingGate>
        </TermsAcceptanceGate>
      </QueryProvider>
    </PostHogProvider>
  </AuthProvider>
  <AppToaster />
  <CookieConsent /> {/* banner + re-open via footers */}
  <ConsentGatedAnalytics /> {/* consent-reactive Vercel Analytics */}
  <WebVitals /> {/* dev/perf-baseline only, no external calls */}
</body>
```

Note: `WebVitals` uses `next/web-vitals` (`useReportWebVitals`) and logs to the console only when `NEXT_PUBLIC_PERF_TIMING=1` or in development. It makes no external network calls and sets no cookies.

---

## Authentication Cookies

Managed entirely by `@supabase/ssr`. DubGrid does not set or modify these cookies directly.

### Cookie Details

- **Name:** `sb-<project-ref>-auth-token` (may be chunked: `.0`, `.1`, etc. for large JWTs)
- **Flags:** `SameSite=Lax`, `httpOnly: false` (these are the `@supabase/ssr` defaults from `DEFAULT_COOKIE_OPTIONS`; the library does not set `HttpOnly` by default)
- **Secure:** Applied by Next.js in production automatically when the response is over HTTPS
- **Duration:** ~400 days (`maxAge: 400 * 24 * 60 * 60` from `@supabase/ssr` defaults), auto-refreshed on activity
- **Contents:** Access token (JWT) + refresh token, base64url-encoded

### Custom JWT Claims

The `custom_access_token_hook` (in `supabase/migrations/002_functions_triggers.sql`) runs on every token issue/refresh and sets top-level JWT claims:

| Claim           | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `platform_role` | `gridmaster` or `none`                                                      |
| `org_role`      | `super_admin`, `admin`, or `user`                                           |
| `org_id`        | Current organization UUID (per-session, from `user_sessions.active_org_id`) |
| `org_slug`      | Current organization slug                                                   |

The hook also updates `profiles.last_sign_in_at` (debounced to 5-minute intervals) for GDPR account-cleanup tracking.

### Middleware Processing

`apps/web/middleware.ts` processes auth cookies on every request:

1. Creates a Supabase server client from request cookies via `createServerClient`
2. Calls `supabase.auth.getSession()` to read the session
3. Attempts JWT signature verification via JWKS endpoint (ES256)
4. Extracts custom claims (`platform_role`, `org_role`, `org_id`, `org_slug`)
5. Enforces route-level RBAC (admin+ routes, gridmaster routes)
6. Sets verified role headers on the response (`x-dubgrid-role`, `x-dubgrid-org-id`, `x-dubgrid-org-slug`)
7. The `setAll()` callback allows Supabase to refresh expired cookies automatically

**Critical fallback:** If `jwtVerify` fails (can occur in production for various reasons), middleware falls back to `decodeJwt` (unverified) for non-gridmaster users. Gridmasters are blocked from unverified tokens. RLS is the real security boundary, not the middleware JWT check.

---

## Sandbox Cookie

Enables per-user Test Sandbox mode, where a super_admin can work against a sandboxed clone of their organization without affecting real data.

### Cookie Details

- **Name:** `dubgrid-sandbox`
- **Flags:** `HttpOnly`, `SameSite=Lax`, `Secure` (production only), `path=/`
- **Duration:** 7 days (`maxAge: 60 * 60 * 24 * 7`); cleared immediately on exit
- **Set by:** Server Route Handler at `apps/web/src/app/api/test-sandbox/route.ts`
- **Read by:** `apps/web/src/lib/sandbox-cookie.ts` (middleware, `api-auth.ts`, `permissions.ts`)

### Payload

```typescript
{
  sandboxOrgId: string,  // sandbox organization UUID
  userId: string         // owner's user ID (verified server-side)
}
```

### Security Notes

The cookie is `HttpOnly` because it is set, read, and cleared entirely server-side. No client JS reads it. Middleware verifies ownership against the database before honoring the cookie, so a forged cookie pointing at another user's sandbox cannot leak data.

### Route Handler Actions

- **`action: "enter"`** — Creates (or reuses) the sandbox for the user and sets the cookie.
- **`action: "exit"`** — Deletes all sandboxes owned by the user and clears the cookie (`maxAge: 0`).
- **`action: "reset"`** — Deletes the sandbox, re-creates it from the source org, and sets a fresh cookie.

---

## Impersonation Cookie

Allows gridmasters to view the app as another user for support and debugging.

### Cookie Details

- **Name:** `dubgrid-impersonation`
- **Flags:** `SameSite=Lax`, `Secure` (on HTTPS; omitted on HTTP), `path=/`
- **`HttpOnly`:** No (client JS sets and clears it via `document.cookie`)
- **Duration:** Dynamic `max-age` based on session expiry (up to 30 minutes)
- **Library:** `apps/web/src/lib/impersonation.ts`

### Payload

```typescript
{
  sessionId: string,       // DB impersonation_sessions.id
  targetUserId: string,    // user being impersonated
  targetOrgId: string,
  targetOrgSlug: string,
  targetOrgRole: string,
  targetEmail: string,
  targetOrgName: string,
  justification: string,   // audit trail reason
  expiresAt: string        // ISO timestamp
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
- `getImpersonationFromCookie(cookieString)` — parses from raw cookie string (Edge middleware and browser)

---

## Sidebar State Cookie

A simple UI-state preference cookie.

- **Name:** `sidebar_state`
- **Value:** `true` or `false`
- **Flags:** `SameSite=Lax`, `Secure` (on HTTPS; omitted on HTTP), `path=/`
- **`HttpOnly`:** No (read by client JS to restore sidebar state on mount)
- **Duration:** 7 days (`max-age=604800`)
- **Set by:** `apps/web/src/components/ui/sidebar.tsx` when the user toggles the sidebar

---

## Theme Preference Cookie

Shares the light/dark/system appearance preference between the apex (`dubgrid.com`) and
every org subdomain (`acme.dubgrid.com`), which are separate browser origins.

- **Name:** `dg-theme`
- **Value:** `light`, `dark`, or `system`
- **Flags:** `SameSite=Lax`, `Secure` (on HTTPS; omitted on HTTP), `path=/`, `domain=.<root>`
- **`HttpOnly`:** No (read by client JS before paint to pick the right theme)
- **Duration:** 1 year (`max-age=31536000`)
- **Set by:** `ThemeCookieSync` in `apps/web/src/components/ThemeProvider.tsx`

`localStorage.theme` (next-themes' own key) remains the source of truth on each origin;
this cookie only seeds it. Because browsers refuse to share a domain-scoped cookie
between `localhost` and `sub.localhost`, it has **no effect in local development** — a
`?theme=` query param on the three cross-origin login links covers dev instead. See
`apps/web/src/lib/theme-preference.ts`.

---

## Cookie Security

### Security Flags Matrix

| Cookie                   | Secure           | HttpOnly                     | SameSite                      |
| ------------------------ | ---------------- | ---------------------------- | ----------------------------- |
| `dubgrid-cookie-consent` | Yes (HTTPS)      | No                           | Lax                           |
| `sb-*-auth-token`        | Yes (HTTPS)      | No (`@supabase/ssr` default) | Lax (`@supabase/ssr` default) |
| `dubgrid-sandbox`        | Yes (production) | **Yes**                      | Lax                           |
| `dubgrid-impersonation`  | Yes (HTTPS)      | No                           | Lax                           |
| `sidebar_state`          | Yes (HTTPS)      | No                           | Lax                           |
| `dg-theme`               | Yes (HTTPS)      | No                           | Lax                           |

### Notes

- **`Secure` flag:** Custom cookies set via `document.cookie` check `window.location.protocol === "https:"` at write time and omit `Secure` on plain HTTP. This means they work without HTTPS in local development.
- **`HttpOnly`:** Only `dubgrid-sandbox` is `HttpOnly`, because it is managed server-side. All other custom cookies are read by client JavaScript for their core functionality.
- **`SameSite=Lax`:** Appropriate for same-site navigation flows. Protects against cross-site request forgery on state-changing requests while still allowing top-level navigations.
- **Note on `sb-*-auth-token`:** The old documentation claimed `HttpOnly: Yes, SameSite=Strict` for Supabase auth cookies. This is incorrect. The `@supabase/ssr` library defaults are `httpOnly: false, sameSite: "lax"` (see `DEFAULT_COOKIE_OPTIONS` in the package source). The `Secure` flag is applied by the Next.js response layer in production.

### Security Headers

`apps/web/next.config.ts` sets the following headers on all responses:

- `X-DNS-Prefetch-Control: on`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

---

## GDPR Compliance

### Consent Audit Trail

Every consent decision is recorded in `cookie_consents` (see [Consent Management](#consent-management)). The table is append-only: each change creates a new row with a timestamp, providing a complete history of user consent decisions.

### Data Export (Article 20: Right to Portability)

**Endpoint:** `GET /api/auth/data-export`  
**File:** `apps/web/src/app/api/auth/data-export/route.ts`

Downloads all user data as a JSON file. Rate-limited to one export per hour (enforced by querying `audit_log` for recent `data.exported` entries).

| Data                     | Source Table                          |
| ------------------------ | ------------------------------------- |
| Profile                  | `profiles`                            |
| Organization memberships | `organization_memberships`            |
| Linked employee records  | `employees` (where `user_id` matches) |
| Shift assignments        | `shifts` (limit 5,000)                |
| Audit log                | `audit_log` (limit 1,000 most recent) |
| Cookie consent records   | `cookie_consents`                     |
| Terms acceptances        | `terms_acceptances`                   |
| Notification preferences | `notification_preferences`            |

**Response:** JSON file with `Content-Disposition: attachment` and `Cache-Control: no-store`.

### Data Erasure (Article 17: Right to be Forgotten)

**Endpoint:** `POST /api/auth/gdpr-erase`  
**Confirmation:** Requires `{ confirmation: "ERASE MY DATA" }` in the request body.

Calls the `gdpr_erase_user_data(p_user_id)` RPC which:

1. Anonymizes profile to "Deleted User"
2. Removes organization memberships
3. Anonymizes linked employee records (clears PII, preserves structure)
4. Strips email from audit log entries
5. Deletes notifications and notification preferences
6. Deletes user sessions
7. Deletes terms acceptances
8. Anonymizes role change log entries
9. (The API endpoint) Deletes the auth user via `auth.admin.deleteUser`

**Safety checks:** Gridmasters cannot self-erase. The RPC anonymizes rather than hard-deletes: employee records and audit trails are preserved without PII.

### Account Deletion

**Endpoint:** `DELETE /api/auth/delete-account`  
**Confirmation:** Requires `{ confirmation: "DELETE MY ACCOUNT" }` in the request body.

Follows the same erasure path with additional guards:

- Gridmasters cannot self-delete.
- Sole super_admins cannot delete their account (must transfer ownership first).

### Automated Account Cleanup

Two SQL functions handle inactive-account lifecycle:

**`flag_inactive_accounts(retention_days INT DEFAULT 730)`** (`002_functions_triggers.sql`)

- Finds profiles where `last_sign_in_at` is older than `retention_days` (default: 2 years)
- Skips gridmasters and already-flagged profiles
- Sets `scheduled_deletion_at = NOW() + 30 days` (grace period) and `deactivation_warned_at = NOW()`
- Returns count of flagged accounts

**`purge_scheduled_accounts()`** (`002_functions_triggers.sql`)

- Finds profiles where `scheduled_deletion_at <= NOW()`
- Skips gridmasters
- Calls `gdpr_erase_user_data()` for each profile
- Returns count of purged accounts
- Does **not** delete `auth.users`; the calling cron handler must call `auth.admin.deleteUser` separately

**Sign-in tracking:** `custom_access_token_hook` updates `profiles.last_sign_in_at` on every token refresh, debounced to 5-minute intervals.

**Usage:** These functions are designed to be called by a cron job or triggered manually by a gridmaster. They are not auto-scheduled within the database.

### Org Soft-Delete

When a super_admin deletes their organization via Settings > Danger Zone, `organizations.archived_at` is set. This timestamp acts as an access-revocation signal:

- Middleware blocks access for non-gridmaster users to archived orgs.
- `get_my_organizations` RPC excludes archived orgs.
- The JWT hook and `switch_org` respect `archived_at`.

### Privacy & Cookie Policy Pages

- **Privacy Policy:** `apps/web/src/app/privacy/page.tsx` — discloses all data collection, third-party processors (Supabase, Vercel, PostHog, Sentry, Stripe), and user rights.
- **Cookie Policy:** `apps/web/src/app/cookie-policy/page.tsx` — full cookie inventory with names, purposes, durations, categories, and an inline preference manager.

Both pages are linked from the consent banner.

---

## Mobile App

The Expo app (`apps/mobile`) ships no analytics or tracking SDKs today and uses native Supabase tokens rather than browser cookies. The consent infrastructure is in place anticipatorily and mirrors the web model.

### Consent Gate

- **`apps/mobile/src/features/consent/lib/consent.ts`** — `getStoredConsent()` / `setStoredConsent()` persist `{ essential, analytics, version }` to `expo-secure-store` under the same `dubgrid-cookie-consent` key and `CONSENT_VERSION` (`"1.2"`) as web. `syncConsentToServer()` POSTs to `/api/consent` on the web app (best-effort, never throws). The request sends an `Origin` header on the same root domain so the CSRF check passes; it records an anonymous row tagged with the mobile user-agent.
- **`apps/mobile/src/features/consent/components/ConsentGate.tsx`** — A non-dismissable first-launch bottom sheet (Accept all / Essential only) wrapped around the app in `app/_layout.tsx`. Re-prompts only when the stored version is stale or absent.
- **Profile > Privacy & data** (`ProfilePrivacyScreen.tsx`) — exposes an analytics toggle that calls `setStoredConsent()`, and links out to the web Privacy, Terms, and Cookie Policy pages.

### App Tracking Transparency (ATT)

`expo-tracking-transparency` is installed. `requestTrackingPermissionIfNeeded()` in `consent.ts` is **scaffolding only; not yet called**, because no SDK currently uses the IDFA. When a tracking SDK ships on mobile, call this function on iOS 14.5+ immediately before initializing that SDK, gated on `consent.analytics === true`.

---

## Data Flow

```
Browser                          Server                         Database
───────                          ──────                         ────────

Visit app ──────────────────────────────────────────────────────►
  ◄─── HTML + CookieConsent.tsx

Read dubgrid-cookie-consent (cookie, then localStorage fallback)
  missing/stale version? → show banner

User clicks "Accept all"
  ├─ write cookie + localStorage (client)
  ├─ POST /api/consent ────────► validate + hash IP ───────────► INSERT cookie_consents
  ├─ dispatch dubgrid:consent-changed
  │   ├─ PostHogProvider (useSyncExternalStore) → enablePostHog()
  │   ├─ ConsentGatedAnalytics (useSyncExternalStore) → render <Analytics/>
  │   └─ instrumentation-client.ts listener → addIntegration(replayIntegration())

Sign in ───────────────────────► Supabase auth ────────────────► auth.users
  ◄─── sb-*-auth-token cookies   custom_access_token_hook ─────► UPDATE profiles.last_sign_in_at
                                  reads user_sessions.active_org_id
                                  sets JWT claims

Navigate ──────────────────────► apps/web/middleware.ts
                                  read auth cookie (sb-*-auth-token)
                                  verify JWT (JWKS; fallback to decodeJwt)
                                  read dubgrid-sandbox cookie → DB ownership check
                                  read dubgrid-impersonation cookie
                                  enforce RBAC
  ◄─── response + refreshed cookies

Enter sandbox ─────────────────► POST /api/test-sandbox { action: "enter" }
                                  verify auth + CSRF
                                  create or reuse sandbox org ─► organizations (sandbox)
  ◄─── Set-Cookie: dubgrid-sandbox (HttpOnly)

Data export ───────────────────► GET /api/auth/data-export
                                  verify session
                                  rate-limit check ────────────► SELECT audit_log
                                  query all user data ─────────► SELECT profiles, memberships,
                                                                  employees, shifts, consents, ...
                                  log export ──────────────────► INSERT audit_log
  ◄─── JSON file download (Content-Disposition: attachment)
```

---

## Developer Guide

### When to bump consent version

Bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx` **and** `apps/mobile/src/features/consent/lib/consent.ts` when:

- A cookie is added or removed
- An analytics or tracking service is added or removed
- What a cookie stores changes materially
- The cookie policy or privacy policy content changes

### Adding a new cookie

1. Set it with at least `SameSite=Lax; path=/`.
2. Add `Secure` if the cookie is set server-side (prefer `process.env.NODE_ENV === "production"`); for client-set cookies, check `window.location.protocol === "https:"`.
3. Add it to the cookie inventory table in `apps/web/src/app/cookie-policy/page.tsx`.
4. If it is non-essential, gate it behind `getCookieConsent()?.analytics === true`.
5. Bump `CONSENT_VERSION` in both the web component and the mobile lib.

### Adding a new third-party service

1. If it sets cookies or collects user data, gate it behind analytics consent.
2. Add it to the "Third-Party Data Processors" section in `apps/web/src/app/privacy/page.tsx`.
3. Add it to the appropriate table in `apps/web/src/app/cookie-policy/page.tsx`.
4. Bump `CONSENT_VERSION`.
5. If it processes personal data server-side, execute a DPA with the provider.

### Testing consent flow

1. Clear all cookies in DevTools (Application > Cookies) and clear `localStorage`.
2. Reload: the consent banner should appear.
3. Click "Essential only": verify no PostHog, Vercel Analytics, or Sentry Session Replay scripts activate in the Network tab.
4. Open the "Cookie preferences" link in any footer: the banner should reopen to the Customize view.
5. Toggle analytics on and click "Save preferences": verify analytics scripts activate without a page reload.
6. Reload again: verify the banner does not reappear.
7. Check the `cookie_consents` table for audit records.

### Key files

| File                                                          | Purpose                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/CookieConsent.tsx`                   | Consent banner, cookie read/write, `CONSENT_VERSION`, server sync, exported helpers                      |
| `apps/web/src/components/ConsentGatedAnalytics.tsx`           | Wraps `<Analytics />` behind consent (reactive)                                                          |
| `apps/web/src/components/PostHogProvider.tsx`                 | PostHog initialization, consent-reactive via `useSyncExternalStore`                                      |
| `apps/web/src/app/api/consent/route.ts`                       | Records consent to DB (POST)                                                                             |
| `apps/web/src/app/api/auth/data-export/route.ts`              | GDPR data export (GET)                                                                                   |
| `apps/web/src/app/api/auth/gdpr-erase/route.ts`               | GDPR data erasure (POST)                                                                                 |
| `apps/web/src/app/api/auth/delete-account/route.ts`           | Account deletion (DELETE)                                                                                |
| `apps/web/src/lib/posthog.ts`                                 | PostHog client helpers (`initPostHog`, `enablePostHog`, `disablePostHog`, etc.)                          |
| `apps/web/src/lib/impersonation.ts`                           | Impersonation cookie utilities                                                                           |
| `apps/web/src/lib/sandbox-cookie.ts`                          | Sandbox cookie parse/encode utilities                                                                    |
| `apps/web/src/app/api/test-sandbox/route.ts`                  | Sandbox enter/exit/reset + cookie lifecycle                                                              |
| `apps/web/src/components/ui/sidebar.tsx`                      | Sidebar state cookie                                                                                     |
| `apps/web/src/app/cookie-policy/page.tsx`                     | Public cookie policy page + `CookiePreferencesManager`                                                   |
| `apps/web/src/app/privacy/page.tsx`                           | Public privacy policy page                                                                               |
| `apps/web/src/instrumentation-client.ts`                      | Sentry client config (`sendDefaultPii: false`, replay consent gate)                                      |
| `apps/web/sentry.server.config.ts`                            | Server-side Sentry bootstrap                                                                             |
| `apps/web/sentry.edge.config.ts`                              | Edge runtime Sentry bootstrap                                                                            |
| `supabase/migrations/001_schema.sql`                          | `cookie_consents`, `profiles`, `user_sessions` schema                                                    |
| `supabase/migrations/002_functions_triggers.sql`              | `custom_access_token_hook`, `flag_inactive_accounts`, `purge_scheduled_accounts`, `gdpr_erase_user_data` |
| `supabase/migrations/003_rls_policies.sql`                    | `cookie_consents` RLS policies                                                                           |
| `apps/web/middleware.ts`                                      | Auth cookie verification, sandbox + impersonation handling, RBAC                                         |
| `apps/mobile/src/features/consent/lib/consent.ts`             | Mobile consent store + ATT scaffolding                                                                   |
| `apps/mobile/src/features/consent/components/ConsentGate.tsx` | Mobile first-launch consent sheet                                                                        |
