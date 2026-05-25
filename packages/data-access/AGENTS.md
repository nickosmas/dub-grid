# Data Access Agent Instructions

Scope: `packages/data-access`, package `@dubgrid/data-access`.

This package owns shared Supabase data access, including mobile data queries.
It is consumed by both `apps/web` and indirectly by `apps/mobile` via the web's
mobile API route handlers. Changes here affect web, mobile, tenant isolation,
and database behavior.

## Source Layout

```
packages/data-access/src/
  index.ts        # Re-exports everything from ./mobile
  mobile.ts       # Mobile-specific data query helpers
```

## Rules

- Preserve `org_id`, user ownership, membership, role, and permission filters on
  every query. Treat all organization-scoped data as tenant-isolation sensitive.
- Do not assume the caller has already authorized access. Verify each helper's
  contract and its callers before relaxing any filter.
- Use typed Supabase client patterns already present in the package.
- Do not use service-role assumptions in general helpers unless the caller and
  risk are fully explicit and documented.
- Keep selected columns intentional. Never return extra PII or sensitive data.
- This package must be platform-neutral: no Next.js, Expo, React Native, DOM-only,
  or Node-only imports.
- Coordinate schema-related changes with `supabase/AGENTS.md` and `@dubgrid/db-types`.

## Verification

- `npm --workspace @dubgrid/data-access run build`
- `npm --workspace @dubgrid/data-access run type-check`
- `npm run test:web` and `npm run test:mobile` for behavior that reaches either app.
