# Shared Packages Agent Instructions

Scope: `packages/*`.

These packages are consumed by the Next.js web app, the Expo mobile app, or
both. Package changes can break multiple apps, so treat public exports and
runtime assumptions carefully.

## Verified Packages

- `@dubgrid/api-client` in `packages/api-client`
- `@dubgrid/authz` in `packages/authz`
- `@dubgrid/contracts` in `packages/contracts`
- `@dubgrid/data-access` in `packages/data-access`
- `@dubgrid/db-types` in `packages/db-types`
- `@dubgrid/design-tokens` in `packages/design-tokens`
- `@dubgrid/domain` in `packages/domain`
- `@dubgrid/mobile-api-core` in `packages/mobile-api-core`
- `@dubgrid/schedule-core` in `packages/schedule-core`

There is no `packages/shared` or `packages/ui` directory at the time this file
was written.

## Verified Commands

- Build all packages: `npm run build:packages`.
- Typecheck all packages through Turbo: `npm run type-check`.
- Test all packages that have tests through Turbo: `npm test`.
- Test contracts directly: `npm --workspace @dubgrid/contracts run test`.
- Build an individual package:
  `npm --workspace <package-name> run build`.
- Typecheck an individual package:
  `npm --workspace <package-name> run type-check`.

## Package Safety Rules

- Preserve public exports unless the user explicitly requests a breaking change.
- Search dependents before changing exported types, schemas, or functions.
- Keep shared packages platform-neutral unless the package's purpose is
  explicitly platform-specific.
- Do not import Next.js, Expo, React Native, DOM, or browser-only APIs into
  general shared packages.
- Do not import Node-only APIs into packages used by mobile/browser code.
- Avoid circular dependencies between workspace packages.
- Prefer existing package boundaries:
  - Contracts and Zod schemas in `@dubgrid/contracts`.
  - Domain types and enums in `@dubgrid/domain`.
  - Permission logic in `@dubgrid/authz`.
  - Schedule logic in `@dubgrid/schedule-core`.
  - Design values in `@dubgrid/design-tokens`.
  - Supabase query/data mapping in `@dubgrid/data-access`.
  - Mobile backend orchestration in `@dubgrid/mobile-api-core`.

## Verification

- If a package changes, run its `build` and `type-check` scripts when present.
- If contracts change, run `npm --workspace @dubgrid/contracts run test`,
  `npm run test:web`, and `npm run test:mobile` when practical.
- If shared behavior affects both apps, run both app test suites or clearly
  state why one was not run.
