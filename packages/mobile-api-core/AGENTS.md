# Mobile API Core Agent Instructions

Scope: `packages/mobile-api-core`.

This package contains shared server-side logic for the mobile API. It is used
by the web app's mobile Route Handlers under `apps/web/src/app/api/mobile/v1`
and `apps/web/src/features/mobile/server`.

## Rules

- Keep this package framework-neutral. Do not import Next.js `Request`,
  `Response`, `NextRequest`, `NextResponse`, route handlers, or UI code here.
- Preserve contracts with `@dubgrid/contracts`; validate input and output at
  the route boundary or shared API boundary.
- Preserve organization, user, membership, and permission checks for every
  mobile API operation.
- Treat notification, push token, shift request, people status, schedule, and
  workspace-selection changes as cross-app changes.
- Keep Supabase service-role behavior out of this package unless explicitly
  justified and verified as server-only.

## Verification

- Run `npm --workspace @dubgrid/mobile-api-core run build`.
- Run `npm --workspace @dubgrid/mobile-api-core run type-check`.
- Run `npm run test:web` for web mobile route coverage.
- Run `npm run test:mobile` when response contracts or mobile behavior change.
