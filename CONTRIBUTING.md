# Contributing to DubGrid

DubGrid is proprietary software. All contributions must be authorized.

---

## Development Setup

1. Follow the [Getting Started](README.md#getting-started) guide.
2. Ensure the Supabase CLI is installed and `supabase start` runs cleanly.
3. Run `npm run db:reset` to apply migrations and seed the local database.
4. Run `npm test` to confirm everything passes before making changes.

---

## Changing Dependencies

`package-lock.json` is a security boundary. Deleting it and reinstalling
re-resolves all ~8,500 packages to whatever is newest on npm that minute, which
is how a freshly published malicious version gets adopted. Never do this:

```bash
rm -rf node_modules package-lock.json && npm install   # ❌ never
```

Add, remove, or bump a dependency this way instead:

```bash
npm install --package-lock-only <pkg>@<version>   # resolve, execute nothing
git diff package-lock.json                        # review what actually moved
npm ci --ignore-scripts && npm run deps:rebuild   # install the reviewed tree
npm run deps:scan && npm audit signatures         # verify before building
```

To see whether anything you just pulled in is brand new (and therefore hasn't
had time to be caught if it is malicious):

```bash
npm run deps:scan -- --freshness --since=origin/main
```

Install scripts are disabled repo-wide in `.npmrc` (`ignore-scripts=true`) — a
compromised package's `preinstall` runs before any of your code imports it.
Packages that genuinely need a native build are allowlisted by name in the
`deps:rebuild` script; if a new dependency needs one, add it there in the same
PR and say why.

Routine bumps should come from Dependabot, which holds new releases for 3–14
days (`.github/dependabot.yml`) so bad publishes are caught upstream first.

---

## Branch Naming

```
feat/short-description       # New features
fix/short-description        # Bug fixes
refactor/short-description   # Code improvements
docs/short-description       # Documentation only
test/short-description       # Tests only
chore/short-description      # Tooling, deps, config
```

Always branch from `dev`. Target PRs to `dev` unless hotfixing `main`.

---

## Commit Messages

Use clear, imperative-style messages:

```
feat: add org soft-delete danger zone
fix: prevent cross-org mutation in shift updates
refactor: extract audit logging into shared utility
docs: update RBAC permission table to 25 permissions
test: add vitest coverage for OnboardingGate
chore: pin protobufjs to 7.5.9
```

Prefix with `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, or `chore:`.

---

## Pull Request Process

1. Create a branch following the naming convention above.
2. Make your changes, ensuring all tests pass (`npm test`).
3. Open a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
4. Fill in the summary, type of change, and testing checklist.
5. Request review.

---

## Code Style

All coding standards (React, Next.js, security) are documented in [CLAUDE.md](CLAUDE.md). Key rules:

- **Server Components by default** — only add `'use client'` when the component requires browser APIs, event handlers, or React hooks.
- **No `useEffect` for derived state** — compute inline or use `useMemo`.
- **React Query for data fetching** — no raw `useEffect` + `fetch` for server data.
- **Validate inputs at server boundaries** — Zod schemas on all Server Actions and Route Handlers.
- **Never expose secrets** — no `NEXT_PUBLIC_` prefix on server-only variables.

---

## Monorepo and Workspace Conventions

DubGrid is an npm-workspaces monorepo orchestrated by Turborepo. Put code in the right place:

- **`apps/web`** (`@dubgrid/web`) — Next.js 16 web app. Pages, API Route Handlers, web-only components and hooks, server-side `lib/db/`. All former repo-root `src/...` paths now live under `apps/web/src/...`.
- **`apps/mobile`** (`@dubgrid/mobile`) — Expo / React Native app (Expo Router). Mobile features and shared UI. Talks only to `/api/mobile/v1/*` on the web app; never imports from `apps/web` directly.
- **`packages/*`** — 10 platform-neutral shared workspaces: `api-client`, `authz`, `client-errors`, `contracts`, `data-access`, `db-types`, `design-tokens`, `domain`, `mobile-api-core`, `schedule-core`.

### Package Boundary Rules

- Shared `packages/*` **must stay platform-neutral** — no Next.js, Expo, React Native, DOM, or Node.js-only imports. Keep them pure TypeScript so both apps can consume them.
- A change to a shared package **affects both `apps/web` and `apps/mobile`** — verify both still build and pass tests before merging.
- Run all workspace tests: `npm test` (Turborepo runs every workspace).
- Run tests for a single workspace: `npm run test:web` or `npm run test:mobile`.
- See the `AGENTS.md` files (repo root, `apps/web`, `apps/mobile`, `packages/`, and per-package) for the conventions of each area.

---

## Project-Specific Rules

These constraints break the app or create security issues if violated:

### Migrations

All schema lives in exactly **4 files**:

| File                                             | Contents                              |
| ------------------------------------------------ | ------------------------------------- |
| `supabase/migrations/001_schema.sql`             | Enums, tables, FKs, indexes, Realtime |
| `supabase/migrations/002_functions_triggers.sql` | Functions, triggers, JWT hook, RPCs   |
| `supabase/migrations/003_rls_policies.sql`       | RLS enable + all policies             |
| `supabase/migrations/004_grants.sql`             | Grants + default privileges           |

**Never create a 005 or later migration file.** Add new content to the appropriate existing file in the correct section.

When adding a table that the JWT hook reads, add explicit `GRANT SELECT ON <table> TO supabase_auth_admin` in `004_grants.sql` and test via `signInWithPassword`, not just direct SQL.

### Routes

All web routes must be **simple page files** (e.g., `apps/web/src/app/people/page.tsx`). Catch-all routes (`[...slug]`) break static prerendering on Vercel. Do not introduce them.

### Naming

- `gridmaster` = `platform_role`. Route: `/gridmaster`. Never call it "admin portal."
- `admin` = `org_role` (tier 2). Per-user configurable permissions.
- Tenant = "Organization" in all user-facing copy. Never "workspace" (except the `workspace_kind` DB column). URL identifier = "subdomain" in copy.

### Cookie Consent

When adding or removing cookies, or changing analytics providers, bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx`. This re-prompts all existing users to re-consent on their next visit.

### Design System

Two parallel component vocabularies exist. Do not mix them:

- **`dg-btn-*` / `dg-input` / `dg-label` / `dg-form-error`** — inside the authenticated app (schedule, people, settings, profile, dashboard, reports).
- **`dg-auth-submit` / `dg-auth-input` / `dg-auth-link` / `dg-auth-heading`** — public auth flows only (login, forgot-password, reset-password, accept-invite, verify-email).

---

## Testing

- Run `npm test` before opening a PR (Vitest + Testing Library, jsdom environment).
- Run `npm run test:e2e` for UI-impacting changes (Playwright).
- No browser required for unit tests — jsdom handles the DOM environment.
- Add tests for new hooks, utility functions, and permission logic.

---

## Database Changes

When modifying the schema:

1. Add your change to the appropriate migration file (`001` through `004`).
2. Run `npm run db:reset` to verify migrations apply cleanly locally.
3. If your change affects the JWT hook, test via `signInWithPassword` (not just direct SQL).
4. If adding a table the hook reads, add explicit grants in `004_grants.sql`.
5. If removing or renaming a table/column, verify RLS policies and grants in `003_rls_policies.sql` and `004_grants.sql` are updated.

See [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md) for the full security model.

---

## Emails

Email templates are react-email components in `apps/web/src/emails/`. After editing a template, regenerate the Supabase HTML files:

```bash
npm --workspace @dubgrid/web run email:build
```

This runs a Vitest script that outputs compiled HTML to `supabase/templates/`.
