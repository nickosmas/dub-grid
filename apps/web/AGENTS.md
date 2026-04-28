# Web App Agent Instructions

Scope: `apps/web`, package `@dubgrid/web`.

This app uses Next.js 16 App Router. Routes live under `apps/web/src/app`.
Middleware lives at `apps/web/middleware.ts`. API routes are Route Handlers
under `apps/web/src/app/api`.

## Verified Commands

- Dev: `npm --workspace @dubgrid/web run dev`.
- LAN dev: `npm --workspace @dubgrid/web run dev:lan`.
- Test: `npm --workspace @dubgrid/web run test`.
- Typecheck: `npm --workspace @dubgrid/web run type-check`.
- Build: `npm --workspace @dubgrid/web run build`.
- Analyze: `npm --workspace @dubgrid/web run analyze`.
- Root web tests: `npm run test:web`.

## Routing and App Router Rules

- Follow the existing App Router setup in `apps/web/src/app`.
- Do not add a Pages Router directory or Pages Router APIs unless explicitly
  requested.
- Use simple route files like `page.tsx`, `layout.tsx`, `loading.tsx`,
  `error.tsx`, and `not-found.tsx`.
- Do not add catch-all routes unless explicitly approved and the static
  prerendering risk is addressed.
- Keep route-specific helpers close to the route, such as existing
  `apps/web/src/app/schedule/_lib`.

## Server and Client Component Rules

- Default to Server Components.
- Add `"use client"` only for browser APIs, event handlers, React client hooks,
  or client-only libraries.
- Push client boundaries to leaf components.
- Do not import server-only modules, Supabase service-role helpers, Stripe
  secret helpers, filesystem APIs, or Node-only APIs into Client Components.
- Do not expose server secrets through `NEXT_PUBLIC_*` variables.

## API, Auth, and Tenant Safety

- Route Handlers must validate request input and authenticate/authorize inside
  the handler or shared server helper.
- Do not rely on middleware alone for authorization.
- Mutating handlers must not use GET.
- Validate origin/CSRF expectations for mutating browser-facing routes.
- Preserve organization and membership boundaries for all `org_id`-scoped data.
- Keep `gridmaster` access explicit. `gridmaster` is a platform role; `admin`
  is an organization role.
- Public and side-effectful routes should use existing rate-limit patterns where
  applicable.
- Service role usage must remain server-only and narrowly scoped.

## Data and Shared Package Rules

- Preserve API contracts shared with mobile through `@dubgrid/contracts`,
  `@dubgrid/mobile-api-core`, `@dubgrid/api-client`, and mobile route handlers
  under `apps/web/src/app/api/mobile/v1`.
- Prefer existing helpers in `apps/web/src/lib`, `apps/web/src/features`, and
  `packages/*` before creating new utilities.
- Use existing Supabase, auth, permission, caching, logger, and rate-limit
  helpers instead of inventing parallel patterns.
- When changing mobile API behavior, run both web and mobile/contract checks.

## UI and Frontend Rules

- Follow existing component patterns in `apps/web/src/components` and feature
  folders.
- Use `next/link` for internal navigation, `next/image` for content images, and
  `next/font` if new font loading is needed.
- Preserve accessibility: labels, keyboard flow, focus management, and contrast.
- Do not change unrelated layout, copy, spacing, or visual design.
- Cookie or analytics changes must update consent behavior as required by the
  root `AGENTS.md`.

## Environment Rules

- Use `.env.example` or `apps/web/.env.example` only for variable names.
- Do not read or print `.env.local` or remote env files.
- `NEXT_PUBLIC_*` values are browser-visible.
- `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret values, Resend keys, Upstash
  tokens, Sentry auth token, and database passwords are server-only.

## Verification

- For UI/component changes, run `npm --workspace @dubgrid/web run test` and
  typecheck when practical.
- For route handler, auth, tenant, database, Stripe, or env changes, run
  `npm --workspace @dubgrid/web run type-check` and targeted tests. Run
  `npm --workspace @dubgrid/web run build` when build/runtime boundaries might
  be affected.
- For mobile API contract changes, also run `npm run test:mobile`.
