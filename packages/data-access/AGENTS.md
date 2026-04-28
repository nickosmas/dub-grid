# Data Access Agent Instructions

Scope: `packages/data-access`.

This package owns shared Supabase data access, including mobile data queries.
Changes here can affect web, mobile, tenant isolation, and database behavior.

## Rules

- Preserve `org_id`, user ownership, membership, role, and permission filters.
- Treat every query involving organization-owned data as tenant-isolation
  sensitive.
- Do not assume the caller has already authorized access; verify the helper's
  contract and callers before relaxing checks.
- Use typed Supabase client patterns already present in the package.
- Do not use service-role assumptions in general data access helpers unless the
  caller and risk are explicit.
- Keep selected columns intentional. Do not return extra PII or sensitive data.
- Coordinate schema-related changes with `supabase/AGENTS.md` and
  `packages/db-types`.

## Verification

- Run `npm --workspace @dubgrid/data-access run build`.
- Run `npm --workspace @dubgrid/data-access run type-check`.
- Run `npm run test:web` and `npm run test:mobile` for behavior that reaches
  either app.
