# Contributing to DubGrid

DubGrid is proprietary software. All contributions must be authorized.

## Development Setup

1. Follow the [Getting Started](README.md#getting-started) guide
2. Ensure Supabase CLI is installed and `supabase start` runs cleanly
3. Run `npm run db:reset` to seed the local database

## Branch Naming

```
feat/short-description     # New features
fix/short-description      # Bug fixes
refactor/short-description # Code improvements
docs/short-description     # Documentation only
```

Always branch from `dev`. Target PRs to `dev` unless hotfixing `main`.

## Commit Messages

Use clear, imperative-style messages:

```
feat: add department permission templates
fix: prevent cross-org mutation in shift updates
refactor: extract audit logging into shared utility
docs: update RBAC permission table to 24 permissions
```

Prefix with `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, or `chore:`.

## Pull Request Process

1. Create a branch following the naming convention above
2. Make your changes, ensuring all tests pass (`npm test`)
3. Open a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md)
4. Fill in the summary, type of change, and testing checklist
5. Request review

## Code Style

All coding standards (React, Next.js, security) are documented in [CLAUDE.md](CLAUDE.md). Key rules:

- **Server Components by default** — only add `'use client'` when needed
- **No `useEffect` for derived state** — compute inline or use `useMemo`
- **React Query for data fetching** — no raw `useEffect` + `fetch`
- **Validate inputs at server boundaries** — Zod schemas on all Server Actions and Route Handlers
- **Never expose secrets** — no `NEXT_PUBLIC_` prefix on server-only variables

## Project-Specific Rules

These are critical constraints that break the app if violated:

- **Migrations:** All schema lives in exactly 4 files (`001_schema.sql` through `004_grants.sql`). NEVER create new migration files.
- **Routes:** All routes must be simple (`src/app/staff/page.tsx`), NOT catch-all. Catch-all routes break static prerendering on Vercel.
- **Naming:** `gridmaster` = platform_role. `admin` = org_role. Never call the gridmaster portal "admin portal."
- **Cookie Consent:** When adding/removing cookies or changing analytics providers, bump `CONSENT_VERSION` in `src/components/CookieConsent.tsx`.

## Testing

- Run `npm test` before opening a PR (vitest + Testing Library)
- Run `npm run test:e2e` for UI-impacting changes (Playwright)
- Tests use jsdom environment — no browser required for unit tests
- Add tests for new hooks, utility functions, and permission logic

## Database Changes

When modifying the schema:
1. Add changes to the appropriate migration file (001-004)
2. Run `npm run db:reset` to verify migrations apply cleanly
3. If your change affects the JWT hook, test via `signInWithPassword` (not just direct SQL)
4. If adding a table the hook reads, add explicit grants in `004_grants.sql`

See [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md) for the full security model.
