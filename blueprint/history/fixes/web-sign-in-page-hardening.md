# Fix: harden the sign-in pages and session cookies (F-204, part)

**Status:** complete

## Problem

The sign-in pages ran under `script-src 'unsafe-inline'` though they render
dynamically, so an injected script there could read the session cookies,
which carried only the library's default flags. `connect-src` allowed any
Supabase project.

## Fix

- The proxy gives `/login`, `/goodbye`, `/accept-invite`, `/forgot-password`,
  `/reset-password` and `/auth/*` the per-request nonce policy. Only the
  prerendered marketing pages keep `'unsafe-inline'`.
- `connect-src` names the configured project (`hostedSupabaseConnectSources`),
  falling back to `*.supabase.co` only when no project URL is set.
- The browser client, the proxy, the login route's cookie writer and the
  auth callback set `SameSite=Lax` and, over https, `Secure`
  (`authCookieOptions`).

## Evidence

- Middleware tests: each sign-in page gets the nonce policy without a
  session; the marketing pages keep the static one.
- The route guard now requires the sign-in pages to render dynamically.
- Unit tests for the connect-src and cookie helpers; type-check and lint pass.
- E2E (production build, three browsers) covers signing in under the new
  policy in CI.

## Not in this fix

- Script-readable cookies and a server-side session limit (rest of F-204).
