# Supabase Agent Instructions

Scope: `supabase`.

This directory contains local Supabase configuration, exactly four migration
files, seed SQL, and auth email templates.

## Verified Structure

- Config: `supabase/config.toml`.
- Migrations:
  - `supabase/migrations/001_schema.sql`
  - `supabase/migrations/002_functions_triggers.sql`
  - `supabase/migrations/003_rls_policies.sql`
  - `supabase/migrations/004_grants.sql`
- Seed SQL:
  - `supabase/seed_arden_wood.sql`
  - `supabase/seed_calm_haven.sql`
  - `supabase/seed_gridmaster.sql`
- Email templates: `supabase/templates`.

## Database and RLS Rules

- Treat schema, RLS, grants, auth hooks, storage, and seed data as high risk.
- Do not create new migration files. Put migration edits in the existing
  `001` through `004` files according to their purpose.
- Never weaken RLS policies, grants, org filters, membership checks, or
  `auth.uid()` checks without explicit approval.
- Preserve tenant isolation for all organization-owned data.
- Never use service-role keys in client-side or mobile code.
- Do not write destructive SQL (`DROP`, `TRUNCATE`, broad `DELETE`, broad
  `UPDATE`) unless explicitly requested and rollback is documented.
- If changing seed data, explain whether it affects local-only seed data or a
  production-facing path.

## Verification

- For schema/RLS changes, inspect all four migration files before editing.
- Prefer local validation with `npm run db:reset` when schema or RLS behavior
  changes, after explaining that it resets the local database.
- Run `npm run gen:types` when schema changes require regenerated types.
- Do not run `npm run db:reset:remote` unless the user explicitly requests it
  and confirms the destructive remote risk.
