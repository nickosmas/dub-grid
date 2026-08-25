# Agent Steering

Root instruction file for DubGrid. Nested `AGENTS.md` files add stricter rules
for their directories. When instructions conflict, the most specific nested
`AGENTS.md` wins, then this file, then the user's latest request.

## Verified Repository Structure

- Package manager: `npm@10.9.2` (node `22.13.x`). Lockfile: `package-lock.json`.
- Workspace runner: Turborepo (`turbo.json`). Workspaces: `apps/*`, `packages/*`.
- Web app: `apps/web`, package `@dubgrid/web`. Next.js 16 App Router in
  `apps/web/src/app`. Middleware at `apps/web/src/middleware.ts`.
- Mobile app: `apps/mobile`, package `@dubgrid/mobile`. Expo SDK 54 with
  Expo Router in `apps/mobile/app`. Feature code in `apps/mobile/src`.
- Shared packages (all platform-neutral unless noted):
  - `@dubgrid/api-client` (`packages/api-client`) — fetch/header utilities
  - `@dubgrid/authz` (`packages/authz`) — role levels, permission builders, JWT claim extraction
  - `@dubgrid/client-errors` (`packages/client-errors`) — error translation, network detection, friendly copy (platform-neutral)
  - `@dubgrid/contracts` (`packages/contracts`) — Zod schemas; exports `.` (main) and `./mobile`
  - `@dubgrid/data-access` (`packages/data-access`) — Supabase query helpers, mobile data queries
  - `@dubgrid/db-types` (`packages/db-types`) — generated DB type subsets (catalog, org, requests, schedule, staff)
  - `@dubgrid/design-tokens` (`packages/design-tokens`) — color/spacing tokens shared by web and mobile
  - `@dubgrid/domain` (`packages/domain`) — domain types, enums, `Organization`, `AdminPermissions`, `isSelfAction`/`assertNotSelf`, billing helpers
  - `@dubgrid/mobile-api-core` (`packages/mobile-api-core`) — shared server-side logic for mobile API route handlers
  - `@dubgrid/schedule-core` (`packages/schedule-core`) — schedule entry types, shift display logic
- Backend/API:
  - Next.js Route Handlers in `apps/web/src/app/api`.
  - Mobile API routes under `apps/web/src/app/api/mobile/v1`.
  - Mobile server implementations in `apps/web/src/features/mobile/server`.
  - Shared mobile backend logic in `packages/mobile-api-core`.
  - Supabase data access in `packages/data-access`.
- Database/Supabase: `supabase/`. Migrations locked to exactly 4 files.

## Verified Commands

- Install: `npm install`.
- Dev web: `npm run dev` or `npm run dev:web`.
- Dev mobile: `npm run dev:mobile`.
- Build web: `npm run build`.
- Build all packages: `npm run build:packages`.
  - Note: `@dubgrid/client-errors` has its own `build`/`type-check`/`test` scripts
    but is NOT included in the root `build:packages` turbo filter; build it directly
    with `npm --workspace @dubgrid/client-errors run build` when changed.
- Lint: `npm run lint`.
- Typecheck (all): `npm run type-check`.
- Test (all): `npm test`.
- Test web: `npm run test:web`.
- Test mobile + contracts: `npm run test:mobile`.
- Test E2E: `npm run test:e2e`.
- Web workspace: `npm --workspace @dubgrid/web run <type-check|test|build|analyze>`.
- Mobile workspace: `npm --workspace @dubgrid/mobile run <type-check|test>`.
- Contracts: `npm --workspace @dubgrid/contracts run test`.
- DB reset (local): `npm run db:reset` (resets local Supabase + re-seeds).
- DB reset (remote): `npm run db:reset:remote` (DESTRUCTIVE — requires explicit user confirmation).
- Generate DB types: `npm run gen:types`.
- Email templates: `npm --workspace @dubgrid/web run email:build` (Vitest-based regeneration of `supabase/templates/*.html`).

Do not use pnpm, Yarn, Nx, or invented commands.

## Core Truthfulness Rules

- Never claim something is true without verifying from repo files, tests, logs,
  official docs, or explicit user-provided context.
- Label uncertainty: `Verified`, `Likely`, `Assumption`, `Not checked`, `Unknown`.
- Do not invent APIs, files, functions, packages, routes, tables, env vars, or commands.
- Inspect relevant files before proposing or applying changes.
- Run the narrowest useful check before claiming something is fixed.

## Evidence Requirements

When answering technical questions: cite exact file paths, functions, or logs.
Separate verified facts from inferences. Do not present guesses as facts.

When reviewing code: follow `code_review.md`. Lead with findings ordered by severity.
For each finding: severity, area, file/location, what is wrong, why it matters, suggested fix.

## Repository Inspection Before Editing

1. `git status --short`.
2. Inspect relevant files.
3. Search existing patterns with `rg`.
4. Identify related tests, types, schemas, migrations, route handlers, exports, config.
5. Confirm current behavior when practical.
6. Choose the smallest safe change.

Do not overwrite user changes, delete files, rename public interfaces, or move
files unless explicitly requested or required for correctness.

## Git and Change Safety

- Do not run destructive git commands (`git reset --hard`, `git clean -fd`,
  `git checkout -- .`, force pushes) unless explicitly instructed.
- Keep changes focused on the user's request. Avoid unrelated refactors.
- Report unrelated issues separately rather than silently fixing them.
- If the worktree is dirty, assume unfamiliar changes belong to the user.

## Security, Secrets, and Environment Variables

- Never print, expose, commit, or log secrets, API keys, tokens, passwords,
  private keys, cookies, or session values.
- Do not read `.env.local`, `.env.remote`, or app-local `.env.local` unless
  explicitly necessary; use `.env.example` files for variable name reference only.
- Server-only secrets: `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`,
  `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `SENTRY_AUTH_TOKEN`, `EXPO_ACCESS_TOKEN`, DB passwords and tokens.
- Public web: `NEXT_PUBLIC_*` (browser-visible). Public mobile: `EXPO_PUBLIC_*` (bundled).
- Document new env var names and purpose; never invent real values.

## Dependency Discipline

- Check existing packages and local utilities before adding any dependency.
- Explain why any new dependency is needed.
- Do not upgrade major versions without explicit request.
- After changes: `npm install`, report lockfile delta, run affected checks.

## Monorepo and Shared Package Safety

- Use shared packages for cross-app logic. Do not duplicate logic both apps share.
- Preserve public exports unless a breaking change is explicitly requested.
- Changes to a shared package require running its checks AND every affected app's checks.
- At minimum consider `npm run build:packages`, `npm run test:web`, `npm run test:mobile`.
- Avoid circular workspace dependencies.
- Packages under `packages/*` must be platform-neutral: no Next.js, Expo, React Native,
  DOM-only, or Node-only imports.

## Project-Specific Constraints

- **Naming**: `gridmaster` = platform_role, route `/gridmaster`. `admin` = org_role.
  Never call the gridmaster portal the "admin portal."
- **Tenant copy**: "Organization" in all user-facing copy. "subdomain" for the URL identifier.
  Never use "workspace" in copy except the DB column `organizations.workspace_kind`.
- **Routes**: Simple files (`apps/web/src/app/people/page.tsx`). No catch-all routes
  (breaks Vercel static prerender). Requires explicit user approval to add one.
- **Migrations**: All schema changes go in the existing 4 files in `supabase/migrations/`.
  Never create a 5th migration file.
- **Cookie consent**: Bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx`
  when adding/removing cookies, changing analytics providers, or updating the cookie policy.
- **Admin permissions**: 25 per-person permissions stored in `organization_memberships.admin_permissions`.
  Departments do NOT grant permissions. `departments.permissions` is vestigial.
- **Middleware JWT fallback**: The `jwtVerify` catch block in `apps/web/src/middleware.ts` MUST
  fall back to `decodeJwt` (unverified) for non-gridmaster users. RLS is the real security
  boundary. Gridmaster is blocked from unverified tokens. Never remove this fallback.
- **OnboardingGate**: The client-side onboarding interstitial is `OnboardingGate`
  (`apps/web/src/components/onboarding/OnboardingGate.tsx`), not `SetupLockGate`.
- **Trial activation**: `start_trial_for_org` RPC; called only on first `super_admin` login
  via `POST /api/auth/start-trial`. Idempotent and self-gating to `super_admin`.
- **Org soft-delete**: `archived_at` on `organizations` revokes access at middleware,
  `get_my_organizations`, JWT hook, and `switch_org`.
- **Per-session org**: `user_sessions.active_org_id` drives JWT claims per device.
  `switch_org` only affects the calling session.
- **Post-login nav**: Login redirects via soft `router.replace("/dashboard")`.
  `AuthSplash` (`apps/web/src/components/AuthSplash.tsx`) bridges the auth-settle gap.
- **CSRF**: `validateCsrfOrigin` from `apps/web/src/lib/csrf.ts` must be called on all
  state-mutating Route Handlers.
- **Email templates**: React Email components in `apps/web/src/emails/`. Run
  `npm --workspace @dubgrid/web run email:build` to regenerate `supabase/templates/*.html`.
- **Test Sandbox**: Cookie-based mode (`apps/web/src/lib/sandbox-cookie.ts`), not `switch_org`
  or subdomain hop.

## High-Risk Changes

Before making a high-risk change, explain: what changes, why needed, what could break,
how it will be verified, and how it can be rolled back.

High-risk changes include:

- Auth, authorization, RBAC, `gridmaster`, `admin`, or permission logic.
- Tenant/org/department/employee/user data isolation.
- Supabase schema, RLS, grants, auth hooks, storage, seed data, or destructive SQL.
- Billing, Stripe, subscription, or seat logic.
- Production config: Vercel, middleware, CSP, Sentry, analytics.
- App identifiers, Expo schemes, native permissions, OTA config.
- Dependency major version upgrades.
- Changes affecting multiple apps or shared packages.
- Data deletion, migration, import/export, GDPR erase, or account deletion.

## Multi-Tenant and RBAC Safety

- Treat tenant isolation bugs as security bugs.
- Do not remove or weaken `org_id`, user ownership, membership, department, or permission filters.
- Keep `gridmaster` bypasses explicit and server-side only.
- Check both authentication and authorization in Route Handlers and backend helpers,
  never only in middleware.
- API mutations MUST use the effective (sandbox-redirected) `orgId` from
  `requireOrgPermissions`, never a raw body `orgId`.

## Database and Supabase Safety

- Never weaken RLS policies or grants without explicit approval.
- Never use `SUPABASE_SECRET_KEY` in client-side, mobile, or browser-bundled code.
- Do not write destructive SQL unless explicitly requested and rollback is documented.
- After schema changes: update the relevant migration file, consider `npm run db:reset`,
  run `npm run gen:types` if the generated-types workflow is affected.
- Any table the `custom_access_token_hook` reads MUST have explicit grants to
  `supabase_auth_admin` in `004_grants.sql`. Testing via direct SQL is NOT sufficient;
  verify via `signInWithPassword`.
- After `DROP SCHEMA public CASCADE; CREATE SCHEMA public`, explicitly grant on all
  existing objects (see `004_grants.sql`). `ALTER DEFAULT PRIVILEGES` alone is not enough.

## Design System Rules

Two button/input vocabularies — not interchangeable:

- **`dg-btn-*` / `dg-input` / `dg-label` / `dg-form-error`** — authenticated app surfaces
  (settings, profile, schedule, people, dashboard, reports).
- **`dg-auth-submit` / `dg-auth-input` / `dg-auth-link` / `dg-auth-heading`** — public auth
  flows only (login, forgot-password, reset-password, accept-invite, verify-email).

Shared primitives to use before inventing a layout:

- `<PageContainer>` — canonical authed-page wrapper (`components/PageContainer.tsx`).
- `<Switch>` — toggle button (`components/ui/switch.tsx`).
- `<EditorActionRow>` — dirty-state footer (`components/ui/editor-action-row.tsx`).
- `<SectionCard>` — bordered settings card (`components/settings/shared.tsx`).
- `<EmptyState size="default|compact|inline">` — only empty-state primitive (`components/EmptyState.tsx`).
- `<ConfirmDialog>` — destructive confirmation (`components/ConfirmDialog.tsx`).
- `<Modal>` — info dialogs only.
- `<ErrorBoundary>` / `<NotFoundBoundary>` — from `components/RouteBoundary.tsx`.
- `<CustomSelect>` — always use instead of native `<select>` (`components/CustomSelect.tsx`).

## React and UI Rules

- Prefer derived values in render over mirrored state.
- `useEffect` only for external systems (timers, subscriptions, browser APIs, third-party libs).
- Do not use `useEffect` to sync state, transform props, respond to events, or reset on prop change.
- Use stable keys (never array index for reorderable lists).
- Preserve accessibility: labels, semantic elements, keyboard behavior, contrast.
- Do not introduce a new UI library without explicit request.

## Verification Requirements

- Run the narrowest useful check for files changed.
- For any repo change, run `npm test` unless clearly impossible.
- Web changes: `npm run test:web`, `npm --workspace @dubgrid/web run type-check`,
  `npm --workspace @dubgrid/web run build` as risk warrants.
- Mobile changes: `npm run test:mobile`, `npm --workspace @dubgrid/mobile run type-check`.
- Shared package changes: package `build`/`type-check` + affected app tests.
- Supabase changes: validate locally with `npm run db:reset` when possible; regenerate
  types with `npm run gen:types` when schema changes.
- Report failures honestly with the error; never claim completion if a check fails
  unless the failure is provably unrelated and explained.

## Final Response Format

```
Summary:
- ...

Repo structure found:
- Package manager:
- Workspace tool:
- Web app:
- Mobile app:
- Shared packages:
- Backend/API:
- Database/Supabase:

Files changed:
- ...

Verification:
- ...

Not checked:
- ...

Risks or follow-up:
- ...
```

If no files changed, say so clearly.
