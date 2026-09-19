# Shared Packages Agent Instructions

Scope: `packages/*`.

All 11 packages are consumed by the Next.js web app, the Expo mobile app, or
both. Package changes can break multiple apps.

## Verified Packages

| Package                    | Path                       | Purpose                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@dubgrid/api-client`      | `packages/api-client`      | Fetch/header utilities, query-param helpers                                                                                                                                                                                                                                                                              |
| `@dubgrid/authz`           | `packages/authz`           | Role levels (`ROLE_LEVEL`), permission builders (`buildPerms`, `buildPermissionContext`), the `VIEW_IMPLICATIONS` map, role baselines (`READ_ONLY_PERMS`, `ADMIN_DEFAULT_PERMS`), JWT claim extraction (`extractJwtClaims`), and the five-minute sensitive-action assurance policy (`assurance.ts`)                      |
| `@dubgrid/client-errors`   | `packages/client-errors`   | Platform-neutral error translation (`formatClientErrorMessage`, `isNetworkConnectionError`, `translateErrorMessage`, `API_ERRORS`, canonical copy constants) and the bounded auth-recovery retry policy (`isRetryableAuthRecoveryError`, `getAuthRecoveryRetryDelay`, `createAuthRecoverySingleFlight`)                  |
| `@dubgrid/contracts`       | `packages/contracts`       | Zod schemas for API contracts (`schedule`, `mobile`, `staff`, `mfa`). One `.` export; the mobile schemas are re-exported from it, there is no `./mobile` subpath                                                                                                                                                         |
| `@dubgrid/data-access`     | `packages/data-access`     | Supabase query helpers and mobile data queries                                                                                                                                                                                                                                                                           |
| `@dubgrid/db-types`        | `packages/db-types`        | Generated DB type subsets (catalog, organization, requests, schedule, staff)                                                                                                                                                                                                                                             |
| `@dubgrid/design-tokens`   | `packages/design-tokens`   | Avatar tone and typography, elevation, gradients, icon tone, job-chip tone, pill colors, the numeric-badge contract, motion, the animated mark, and the `mobile*` spacing/type/control ramps                                                                                                                             |
| `@dubgrid/domain`          | `packages/domain`          | Core domain types and helpers: `Organization`, `AdminPermissions` (26 keys), `PlatformRole`, `OrganizationRole`, `WorkspaceKind`, `isSelfAction`, `assertNotSelf`, `SelfActionForbiddenError`, password rules, `CURRENT_TERMS_VERSION`, `resolveAlertDestination`, billing helpers, notification metadata, request types |
| `@dubgrid/mobile-api-core` | `packages/mobile-api-core` | Server-side logic for mobile API route handlers (auth, dashboard, organization, people-status, push, read, setup, shift-requests, write)                                                                                                                                                                                 |
| `@dubgrid/realtime-core`   | `packages/realtime-core`   | Shared realtime subscription, channel, and invalidation primitives                                                                                                                                                                                                                                                       |
| `@dubgrid/schedule-core`   | `packages/schedule-core`   | Schedule entry types, the shared coverage and hours engines, pay periods, open-shift derivation, request assembly, segment alignment, team-schedule shaping (web dashboard, mobile API, and mobile app all consume it)                                                                                                   |

There is no `packages/shared` or `packages/ui` directory.

## Verified Commands

- Build all eleven: `npm run build:packages` (the web and mobile `predev`/`prebuild`
  hooks run it; `npm test` does not, so rebuild after changing an export before
  testing a consumer)
- Typecheck all via Turbo: `npm run type-check`
- Test all via Turbo: `npm test`
- Test one package: `npm --workspace @dubgrid/<name> run test` (`data-access` and `db-types` have no test script)
- Individual package: `npm --workspace <package-name> run <build|type-check>`

## Platform-Neutrality Rule (CRITICAL)

Packages under `packages/*` must not import:

- `next/` anything (Next.js server or client APIs)
- `expo-*` or `react-native` (Expo or RN APIs)
- DOM-only browser APIs (`window`, `document`, `localStorage`)
- Node-only APIs (`fs`, `path`, `process.env` — use function params instead)

The root ESLint config enforces this (`no-restricted-imports` on `packages/**`).
Keep the `zod` specifier identical in every workspace: a diverging pin re-nests a
second copy and a schema built in one package stops being an `instanceof` match in
another.

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
- Realtime primitives: `@dubgrid/realtime-core`
- DB type subsets: `@dubgrid/db-types`

## Verification

- Package changed: run its `build` and `type-check` scripts.
- Contracts changed: `npm --workspace @dubgrid/contracts run test` +
  `npm run test:web` + `npm run test:mobile`.
- Behavior affecting both apps: run both app test suites or explain why one was skipped.
