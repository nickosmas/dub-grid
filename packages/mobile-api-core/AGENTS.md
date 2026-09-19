# Mobile API Core Agent Instructions

Scope: `packages/mobile-api-core`, package `@dubgrid/mobile-api-core`.

Shared server-side logic for the mobile API. Used by the web app's mobile
Route Handlers under `apps/web/src/app/api/mobile/v1` and server implementations
in `apps/web/src/features/mobile/server`.

## Source Layout

```
packages/mobile-api-core/src/
  index.ts          # Package entry point
  auth.ts           # Auth-related mobile API logic (rejects sandbox orgs, MFA-required challenge)
  dashboard.ts      # Canonical dashboard payload (coverage, open shifts, drafts) over schedule-core
  organization.ts   # Org-selection and organization-status logic
  people-status.ts  # Employee status helpers
  push.ts           # Push token registration/management
  read.ts           # Schedule/shift read operations
  setup.ts          # Mobile app setup/bootstrap logic
  shift-requests.ts # Shift request operations
  write.ts          # Schedule write operations
```

## Rules

- Keep this package framework-neutral. Do not import `next/server`, `NextRequest`,
  `NextResponse`, Next.js route handler types, or any UI code. The package must
  be callable from server code without coupling to Next.js.
- Preserve contracts with `@dubgrid/contracts` (mobile schemas come from its single `.` export). Validate
  input and output at the route boundary or shared API boundary.
- Preserve organization, user, membership, and permission checks for every
  mobile API operation.
- Treat push token, shift request, people status, schedule, and org-selection
  changes as cross-app changes requiring both web and mobile test coverage.
- Do not use service-role assumptions unless explicitly justified, documented,
  and verified as server-only.
- No Expo, React Native, DOM-only, or Node-only imports.

## Verification

- `npm --workspace @dubgrid/mobile-api-core run build`
- `npm --workspace @dubgrid/mobile-api-core run type-check`
- `npm run test:web` for web mobile route coverage.
- `npm run test:mobile` when response contracts or mobile behavior change.
