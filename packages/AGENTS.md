# Shared Packages Agent Instructions

Scope: `packages/*`.

All 10 packages are consumed by the Next.js web app, the Expo mobile app, or
both. Package changes can break multiple apps.

## Verified Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@dubgrid/api-client` | `packages/api-client` | Fetch/header utilities, query-param helpers |
| `@dubgrid/authz` | `packages/authz` | Role levels (`ROLE_LEVEL`), permission builders (`buildPerms`, `buildPermissionContext`, `unionPermissions`), JWT claim extraction (`extractJwtClaims`), `READ_ONLY_PERMS` |
| `@dubgrid/client-errors` | `packages/client-errors` | Platform-neutral error translation: `formatClientErrorMessage`, `isNetworkConnectionError`, `translateErrorMessage`, canonical copy constants (`NETWORK_ERROR_MESSAGE`, `DEFAULT_ERROR_FALLBACK`) |
| `@dubgrid/contracts` | `packages/contracts` | Zod schemas for API contracts. Two exports: `.` (main) and `./mobile` (mobile-specific schemas) |
| `@dubgrid/data-access` | `packages/data-access` | Supabase query helpers and mobile data queries |
| `@dubgrid/db-types` | `packages/db-types` | Generated DB type subsets (catalog, organization, requests, schedule, staff) |
| `@dubgrid/design-tokens` | `packages/design-tokens` | Color and spacing tokens shared by web and mobile (`colorTokens`, etc.) |
| `@dubgrid/domain` | `packages/domain` | Core domain types and helpers: `Organization`, `AdminPermissions`, `PlatformRole`, `OrganizationRole`, `WorkspaceKind`, `isSelfAction`, `assertNotSelf`, `SelfActionForbiddenError`, billing helpers, notification metadata, request types |
| `@dubgrid/mobile-api-core` | `packages/mobile-api-core` | Server-side logic for mobile API route handlers (auth, org, people-status, push, read, write, shift-requests, setup) |
| `@dubgrid/schedule-core` | `packages/schedule-core` | Schedule entry types, shift display logic |

There is no `packages/shared` or `packages/ui` directory.

## Verified Commands

- Build all (except `@dubgrid/client-errors`): `npm run build:packages`
  - `@dubgrid/client-errors` is NOT in the `build:packages` turbo filter;
    build it with `npm --workspace @dubgrid/client-errors run build`.
- Typecheck all via Turbo: `npm run type-check`
- Test all via Turbo: `npm test`
- Test contracts: `npm --workspace @dubgrid/contracts run test`
- Test client-errors: `npm --workspace @dubgrid/client-errors run test`
- Individual package: `npm --workspace <package-name> run <build|type-check>`

## Platform-Neutrality Rule (CRITICAL)

Packages under `packages/*` must not import:

- `next/` anything (Next.js server or client APIs)
- `expo-*` or `react-native` (Expo or RN APIs)
- DOM-only browser APIs (`window`, `document`, `localStorage`)
- Node-only APIs (`fs`, `path`, `process.env` — use function params instead)

A package may accept a typed Supabase client as a parameter without importing
the Supabase SSR/browser-specific setup code itself.

## Package Safety Rules

- Preserve public exports unless a breaking change is explicitly requested.
- Search all dependents before changing exported types, schemas, or functions.
- Avoid circular dependencies between workspace packages.
- Do not duplicate logic already owned by a package.

Prefer existing boundaries:
- Zod schemas/API contracts: `@dubgrid/contracts`
- Domain types and enums: `@dubgrid/domain`
- Permission/role logic: `@dubgrid/authz`
- Schedule display logic: `@dubgrid/schedule-core`
- Design values: `@dubgrid/design-tokens`
- Error translation: `@dubgrid/client-errors`
- Supabase queries: `@dubgrid/data-access`
- Mobile API orchestration: `@dubgrid/mobile-api-core`
- DB type subsets: `@dubgrid/db-types`

## Verification

- Package changed: run its `build` and `type-check` scripts.
- Contracts changed: `npm --workspace @dubgrid/contracts run test` +
  `npm run test:web` + `npm run test:mobile`.
- Behavior affecting both apps: run both app test suites or explain why one was skipped.
