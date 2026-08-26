# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

DubGrid is a proprietary SaaS application. Only the latest deployed version receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability in DubGrid, please report it responsibly:

1. **Email:** Send a detailed report to **security@dubgrid.com**
2. **Include:** Description of the vulnerability, steps to reproduce, potential impact, and any suggested fixes
3. **Do NOT** open a public GitHub issue for security vulnerabilities

### What to Expect

- **Acknowledgment:** Within 48 hours of your report
- **Assessment:** We will evaluate the severity and impact within 5 business days
- **Resolution:** Critical vulnerabilities are prioritized for immediate patching
- **Disclosure:** We follow coordinated disclosure — we will work with you on a timeline before any public disclosure

## Security Architecture

DubGrid implements defense-in-depth across every layer:

### Edge Middleware (`apps/web/src/middleware.ts`)

- JWT signature verification via Supabase JWKS endpoint (ES256)
- Per-request nonce-based CSP for the authenticated app (`strict-dynamic`, no `unsafe-inline`); static/public pages use `unsafe-inline`
- Route-level RBAC and org suspension/archival enforcement
- `decodeJwt` fallback for non-gridmaster users when `jwtVerify` fails (RLS is the real boundary; gridmaster is blocked from unverified tokens)

### CSRF Protection

- Server Actions have built-in CSRF protection from Next.js
- All state-changing Route Handlers call `validateCsrfOrigin` (`apps/web/src/lib/csrf.ts`), which validates the `Origin` header against the site root domain (supports multi-tenant subdomains)
- Supabase auth cookies use `SameSite=Lax` as a secondary CSRF control

### Rate Limiting (`apps/web/src/lib/rate-limit.ts`)

All limiters are Upstash Redis sliding-window, fail-closed in production. Defined limiters:

| Limiter                 | Limit | Window | Key               | Used by                                                |
| ----------------------- | ----- | ------ | ----------------- | ------------------------------------------------------ |
| `loginLimiter`          | 15    | 15 min | email hash        | `/api/auth/login`, mobile login                        |
| `passwordResetLimiter`  | 5     | 15 min | email hash        | `/api/gridmaster/password-reset`                       |
| `inviteLimiter`         | 100   | 1 hour | user ID           | `/api/send-invite-email`                               |
| `emailTargetLimiter`    | 5     | 1 hour | target email hash | invite + password-reset (per-recipient flooding guard) |
| `demoLimiter`           | 3     | 1 hour | IP                | `/api/request-demo`                                    |
| `apiLimiter`            | 10    | 10 sec | IP                | most mutating API routes                               |
| `scheduleReviewLimiter` | 60    | 10 sec | user ID           | schedule review/publish                                |

### Authentication and Authorization

- Custom JWT hook (`custom_access_token_hook`) runs on every token issue/refresh, baking `platform_role`, `org_role`, `org_id`, and `org_slug` as top-level claims
- Hook strips org claims for archived/suspended orgs and deactivated users; honors `jwt_refresh_locks`
- All Server Actions and Route Handlers re-check auth/authorization independently; middleware is a first filter, not the sole gate
- Per-session org isolation: `user_sessions.active_org_id` drives JWT claims per device; `switch_org` affects only the calling device

### Row-Level Security (RLS)

- All 36 tables have RLS enabled; tenant isolation is enforced at the DB via `caller_org_id()`
- `caller_org_id()` prefers the JWT-baked per-session claim, preventing sibling-device leakage

### Role-Change Hardening

- `change_user_role` RPC: caller-identity check, self-action guard, admin-tier guard (admins cannot touch admin/super_admin/gridmaster), last-super_admin guard, advisory lock, idempotency key dedup, immutable audit log, 5s JWT refresh lock
- Gridmaster demotion/deactivation: 5-minute refresh lock + immediate session wipe
- 25 per-person admin permissions stored in `organization_memberships.admin_permissions`
- Direct `org_role` UPDATEs blocked by the `guard_org_role_change` trigger

### Security Headers (`apps/web/next.config.ts`)

Applied to every response:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-DNS-Prefetch-Control: on`

### Dependency Security

- Env vars validated at startup via Zod (`apps/web/src/lib/env.ts`); strict validation in production
- `protobufjs` pinned to `7.5.9` and `fast-uri` to `^3.1.2` via scoped npm overrides in root `package.json`
- `react` and `react-dom` pinned to `19.2.3` in root `overrides` to enforce a single copy
- `npm audit`: 0 critical, 0 unreviewed high (8 high in the Metro/`image-size`
  build chain are allowlisted with an expiry — see below), 3 moderate in `hono`
  via the `@modelcontextprotocol/sdk` dev CLI only

### Supply-Chain Controls

Compromised npm packages are a routine attack path now: the August 2026 worm
trojanized hundreds of popular packages and stole credentials from a
`preinstall` script, before any application code imported the package. These
controls assume a dependency will eventually be malicious.

- **Lifecycle scripts never run on install.** `ignore-scripts=true` in `.npmrc`,
  plus an explicit `npm ci --ignore-scripts` in every CI job. The packages that
  need a native build are rebuilt by name via `npm run deps:rebuild`
  (`@prisma/engines`, `@snaplet/seed`, `@sentry/cli`). Widen that allowlist
  deliberately; never relax the flag.
- **`package-lock.json` is a security boundary, not a cache.** Never
  `rm package-lock.json && npm install` — that re-resolves the whole tree to
  whatever is newest, which during an active campaign means adopting a
  malicious version within hours of publication. See CONTRIBUTING.md for the
  supported way to change a dependency.
- **Updates arrive on a cooldown** (`.github/dependabot.yml`): 3 days for
  patches, 7 for minors, 14 for majors, so the ecosystem has time to detect and
  unpublish a bad release before we take it.
- **CI verifies more than advisories.** `npm run deps:audit` for known
  CVEs, `npm audit signatures` for registry attestation over the installed tree,
  `npm run deps:scan` for known-bad versions / worm markers / planted
  persistence files, and an advisory freshness job that flags any version
  published inside the cooldown window.
- **An advisory with no fix is allowlisted, never waved through.** When upstream
  has published no patched version, `scripts/audit-check.mjs` can suppress that
  specific GHSA — with a written reason and a `reviewBy` date. Past the date it
  blocks again, and an entry that stops matching anything also blocks, so the
  list cannot rot into a permanent waiver. Everything else fails the build as
  before. Lowering `--audit-level` to get green is the thing this exists to
  prevent. Currently allowlisted: `image-size` (GHSA-w3rx-r6r6-pgpr,
  GHSA-5p2g-fcmc-qvqq) and the Metro/Expo chain that depends on it — build-time
  only, no patched release exists at any version, review by 2026-11-01.
- **Actions are pinned to commit SHAs**, and every workflow declares
  `permissions: contents: read`, so a dependency executing in CI cannot inherit
  a token that writes to the repo.
- **Secrets are step-scoped.** `SUPABASE_SECRET_KEY`, `SENTRY_AUTH_TOKEN`,
  and the E2E Upstash credentials are absent from the environment during
  `npm ci` and present only for the steps that need them. Harvesting
  `process.env` is the first thing a compromised package does.

The scanner also covers a gap specific to this repo: `.claude/` is gitignored,
so a planted `.claude/setup.mjs` would never surface in `git status`.

### Sandbox Cookie (`dubgrid-sandbox`)

- `HttpOnly: true`, `SameSite=Lax`, `Secure` — set and read server-side only
- Middleware re-verifies ownership against the DB before honoring it; a forged cookie cannot escalate privilege

### Error Handling

- `packages/client-errors` sanitizes all PGRST/Supabase/RLS/JWT/SQL errors to generic messages
- No stack traces, DB internals, or raw error messages reach the client
- Full errors logged server-side only

### Input Validation

- All Server Actions and Route Handlers use Zod schema validation
- No string-interpolated SQL; all DB access uses the parameterized Supabase query builder
- Zero `dangerouslySetInnerHTML`, zero `eval`/`new Function` in `apps/` and `packages/`

## Operational Security

- [Secret Rotation Runbook](docs/secrets-rotation.md)
- [Cookie and GDPR Compliance](docs/cookies-and-gdpr.md)
- [Full Security Audit](SECURITY_AUDIT.md)
- [RBAC System Design](RBAC_SYSTEM_DESIGN.md)
