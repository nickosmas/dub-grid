# Agent Steering

This is the root Codex instruction file for DubGrid. It is intentionally
self-contained and repo-specific. Nested `AGENTS.md` files add stricter rules
for their directories.

If instructions conflict, follow the most specific nested `AGENTS.md` first,
then this root file, then the user's latest request.

## Verified Repository Structure

- Package manager: npm, declared as `npm@10.9.2` in `package.json`.
- Lockfile: `package-lock.json`.
- Workspaces: npm workspaces for `apps/*` and `packages/*`.
- Workspace runner: Turborepo via `turbo.json`.
- Web app: `apps/web`, package `@dubgrid/web`, Next.js 16 App Router in
  `apps/web/src/app`.
- Mobile app: `apps/mobile`, package `@dubgrid/mobile`, Expo SDK 54 with Expo
  Router routes in `apps/mobile/app`.
- Shared packages:
  - `packages/api-client`
  - `packages/authz`
  - `packages/contracts`
  - `packages/data-access`
  - `packages/db-types`
  - `packages/design-tokens`
  - `packages/domain`
  - `packages/mobile-api-core`
  - `packages/schedule-core`
- Backend/API areas:
  - Next Route Handlers in `apps/web/src/app/api`.
  - Mobile backend routes in `apps/web/src/app/api/mobile/v1`.
  - Mobile server route implementations in `apps/web/src/features/mobile/server`.
  - Shared mobile backend logic in `packages/mobile-api-core`.
  - Supabase data access in `packages/data-access`.
- Database/Supabase: `supabase` exists. Migrations are intentionally limited to
  `supabase/migrations/001_schema.sql`, `002_functions_triggers.sql`,
  `003_rls_policies.sql`, and `004_grants.sql`.

## Verified Commands

- Install: `npm install`.
- Root dev web: `npm run dev` or `npm run dev:web`.
- Root dev mobile: `npm run dev:mobile`.
- Root build: `npm run build` builds the web app through Turbo.
- Root package build: `npm run build:packages`.
- Root lint: `npm run lint`.
- Root typecheck: `npm run type-check`.
- Root tests: `npm test`.
- Web tests: `npm run test:web`.
- Mobile plus contracts tests: `npm run test:mobile`.
- E2E tests: `npm run test:e2e`.
- Web app checks:
  - `npm --workspace @dubgrid/web run type-check`
  - `npm --workspace @dubgrid/web run test`
  - `npm --workspace @dubgrid/web run build`
- Mobile app checks:
  - `npm --workspace @dubgrid/mobile run type-check`
  - `npm --workspace @dubgrid/mobile run test`
- Contracts tests: `npm --workspace @dubgrid/contracts run test`.
- Supabase local reset and seed: `npm run db:reset`.
- Supabase type generation script: `npm run gen:types`.

Do not use pnpm, Yarn, Nx, or invented commands unless the repo changes and you
verify the change first.

## Core Truthfulness Rules

- Never claim something is true unless it has been verified from repository
  files, tests, logs, official documentation, or explicit user-provided context.
- If information is uncertain, say so clearly with labels like `Verified`,
  `Likely`, `Assumption`, `Not checked`, or `Unknown`.
- Do not invent APIs, files, functions, packages, routes, database tables,
  environment variables, commands, or product requirements.
- Before proposing or applying a code change, inspect the relevant files first.
- Before saying something is fixed or works, run the most relevant available
  test, typecheck, build, lint, or manual verification command.
- If a check cannot be run, say exactly why and what was checked instead.

## Evidence Requirements

When answering technical questions:

- Cite exact file paths, functions, classes, commands, logs, or documentation
  used as evidence.
- Clearly separate verified facts from inferences.
- Do not present guesses, estimates, or likely explanations as facts.

When reviewing code:

- Follow `code_review.md` if it exists.
- Lead with findings, ordered by severity.
- For every finding, include severity, affected area, file/location, what is
  wrong, why it matters, and a suggested fix.
- Do not report speculative issues as confirmed bugs.
- If no issues are found, say what was reviewed and what was not reviewed.

## Repository Inspection Before Editing

Before editing code:

1. Check `git status --short`.
2. Inspect the relevant files.
3. Search for existing patterns with `rg`.
4. Identify related tests, types, schemas, migrations, route handlers, app
   routes, configuration files, and package exports.
5. Confirm current behavior when practical.
6. Choose the smallest safe change.

Do not overwrite user changes, delete files, rename public interfaces, or move
files unless explicitly requested or necessary for correctness.

## Git and Change Safety

- Do not run destructive git commands such as `git reset --hard`,
  `git clean -fd`, `git checkout -- .`, or force pushes unless explicitly
  instructed.
- Keep changes focused on the user's request.
- Avoid unrelated refactors and metadata churn.
- If unrelated issues are noticed, report them separately instead of fixing them
  silently.
- If the worktree is dirty, assume changes you did not make belong to the user
  and work around them.

## Security, Secrets, and Environment Variables

- Never print, expose, commit, or log secrets, API keys, tokens, passwords,
  private keys, cookies, session values, or credentials.
- Do not read `.env.local`, `.env.remote`, app-local `.env.local`, or other
  non-example env files unless explicitly necessary; never paste their values.
- Use `.env.example`, `apps/web/.env.example`, and `apps/mobile/.env.example`
  only as variable-name references.
- Server-only secrets include `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `SENTRY_AUTH_TOKEN`, `EXPO_ACCESS_TOKEN`, database passwords, and tokens.
- Public web variables use `NEXT_PUBLIC_*`; public mobile variables use
  `EXPO_PUBLIC_*`. Treat them as bundled/client-visible.
- If a new env var is needed, document the variable name and purpose, but do
  not invent a real value.
- If a real secret appears in code, logs, config, or command output, stop and
  report it without repeating the secret.

## Dependency Discipline

- Do not add dependencies unless necessary.
- First check existing dependencies and local utilities in `apps/*`,
  `packages/*`, and `scripts`.
- Explain why any new dependency is needed.
- Do not upgrade major dependency versions unless explicitly requested.
- After dependency changes, run `npm install`, report lockfile changes, and run
  affected build/typecheck/test commands.

## Monorepo and Shared Package Safety

- Prefer shared packages for cross-app logic that is already shared:
  `@dubgrid/contracts`, `@dubgrid/domain`, `@dubgrid/schedule-core`,
  `@dubgrid/design-tokens`, `@dubgrid/api-client`, `@dubgrid/authz`,
  `@dubgrid/db-types`, `@dubgrid/data-access`, and
  `@dubgrid/mobile-api-core`.
- Do not duplicate shared logic in both apps when a package already owns it.
- Preserve public exports from packages unless the user explicitly asks for a
  breaking change.
- If shared package behavior changes, run package checks and every affected app
  check. At minimum consider `npm run build:packages`, `npm run test:web`, and
  `npm run test:mobile`.
- Avoid circular workspace dependencies. Keep package dependency direction
  intentional.
- Do not import Next-only code into Expo or React Native code.
- Do not import Expo or React Native-only code into Next server code.

## Project-Specific Constraints

- Naming: `gridmaster` is the platform role and route (`/gridmaster`).
  `admin` is an organization role. Do not call the gridmaster portal the
  "admin portal."
- Routes: use simple route files such as `apps/web/src/app/staff/page.tsx`.
  Do not add catch-all routes unless the user explicitly approves and the Vercel
  static prerendering risk is addressed.
- Migrations: schema changes stay in the existing four files under
  `supabase/migrations`. Do not create a fifth migration file.
- Cookie consent: when adding/removing cookies, changing analytics providers,
  or changing cookie/privacy policy text, bump `CONSENT_VERSION` in
  `apps/web/src/components/CookieConsent.tsx`.

## High-Risk Changes

Before making a high-risk change, stop and explain:

- What will change.
- Why it is needed.
- What could break.
- How it will be verified.
- How it can be rolled back.

High-risk changes include:

- Authentication, authorization, RBAC, `gridmaster`, `admin`, or permission
  logic.
- Tenant, organization, facility, department, employee, or user-owned data
  isolation.
- Supabase schema, RLS, grants, auth hooks, storage, seed data, or destructive
  SQL.
- Billing, Stripe, subscription, or seat logic.
- Production deployment config, Vercel config, middleware, CSP, Sentry, or
  analytics.
- App identifiers, Expo schemes, native permissions, OTA/update behavior, or
  mobile environment plumbing.
- Dependency major version upgrades.
- Changes affecting multiple apps or shared packages.
- Data deletion, migration, import/export, GDPR erase, or account deletion.

## Multi-Tenant and RBAC Safety

This repo uses organization-scoped data (`org_id`), roles, memberships,
`gridmaster` platform access, organization roles such as `admin` and
`super_admin`, and Supabase RLS policies.

- Treat tenant isolation bugs as security bugs.
- Do not remove or weaken `org_id`, user ownership, membership, department, or
  permission filters.
- For tenant-owned data, verify how tenant identity is established and enforced
  before changing queries or policies.
- Keep `gridmaster` bypasses explicit and server-side.
- Check both authentication and authorization in Route Handlers and shared
  backend helpers, not only in middleware.
- Never rely on client-side checks to authorize data access.

## Database and Supabase Safety

- Treat migrations, RLS policies, grants, auth hooks, seed data, and generated
  DB types as high risk.
- Never weaken RLS policies or grants without explicit approval.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in client-side code, mobile code, or any
  browser-bundled module.
- Do not write destructive SQL (`DROP`, `TRUNCATE`, broad `DELETE`, broad
  `UPDATE`) unless explicitly requested and rollback is documented.
- If schema changes are made, update the existing migration files, consider
  `npm run db:reset`, and run `npm run gen:types` if generated type workflow is
  affected.
- Do not run `npm run db:reset:remote` unless the user explicitly requests
  remote reset and confirms the risk.

## React and UI Rules

- Prefer derived values in render over mirrored state.
- Use `useEffect` only for synchronizing with external systems such as browser
  APIs, subscriptions, timers, or third-party libraries.
- Do not use `useEffect` to sync state to state, transform props, respond to
  user events, or reset state on prop changes.
- Use stable keys for reorderable lists.
- Follow existing component, style, and folder patterns before adding new ones.
- Preserve accessibility basics: labels, semantic elements where applicable,
  keyboard behavior, focus management, and readable contrast.
- Do not introduce a new UI library unless explicitly requested.

## Verification Requirements

- Run the narrowest useful checks for the files changed.
- For any repository change, run `npm test` unless clearly impossible.
- For web changes, prefer `npm run test:web`, `npm --workspace @dubgrid/web run
  type-check`, and `npm --workspace @dubgrid/web run build` as risk requires.
- For mobile changes, prefer `npm run test:mobile` and
  `npm --workspace @dubgrid/mobile run type-check` as risk requires.
- For shared package changes, run the package's `build`/`type-check` plus every
  affected app's tests.
- For Supabase changes, validate migrations locally when possible and regenerate
  types when the schema/type workflow requires it.
- If a command fails, report the failure honestly with the relevant error and
  do not claim completion unless the failure is unrelated and explained.
- There is no markdown-specific validation script in `package.json`; use
  `git diff --check` for Markdown whitespace unless a markdown tool is later
  added.

## Final Response Format

Use this structure for completed coding or repository-change tasks:

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

If no files changed, say so clearly.
