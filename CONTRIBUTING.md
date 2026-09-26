# Contributing to DubGrid

DubGrid is proprietary software. All contributions must be authorized.

---

## Development Setup

1. Follow the [Getting Started](README.md#getting-started) guide.
2. Ensure the Supabase CLI is installed and `supabase start` runs cleanly.
3. Run `npm run db:reset` to apply migrations and seed the local database.
4. Run `npm run hooks:install` to enable the repo's git hooks (see below).
5. Run `npm test` to confirm everything passes before making changes.

### Git Hooks

The hooks live in `.githooks/` and are version-controlled, but git only picks
them up once `core.hooksPath` points at that directory. That setting is local to
each clone, so **every clone has to run it once**:

```bash
npm run hooks:install
```

Without it nothing breaks, you just lose the safety net and land formatting and
lint errors in CI instead.

- **pre-commit** — Prettier and ESLint over the _staged files only_, so it stays
  fast. Lint errors block; the repo's known warnings do not.
- **commit-msg** - strips AI attribution trailers. The no-attribution rule in
  `blueprint/context/ai-interaction.md` is markdown an agent's own session
  instructions can override without anyone noticing, so it is enforced here
  instead. A human co-author trailer is left alone.
- **pre-push** — `type-check` and the full `test` suite, both through Turborepo,
  so unchanged workspaces replay from cache.

Bypass with `--no-verify` on `git commit` or `git push` when you genuinely
need to.

We deliberately do not use husky: it installs itself through a `prepare` script,
and install scripts are disabled repo-wide (see
[Changing Dependencies](#changing-dependencies)). `.githooks/` needs no
dependency at all.

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

These names are for work that gets a branch of its own: a contributor in their
own clone, a Claude Code cloud session (which pushes `claude/*` branches), or
Dependabot. All of them merge into `dev` through a pull request.

Agent sessions working in a shared local checkout do not branch. Several run
against one working tree at once, so branches there would collide; they commit
straight to `dev` from a throwaway worktree instead. See "DubGrid Git policy"
and "Work in a throwaway worktree" in `AGENTS.md`.

---

## Commit Messages

Use clear, imperative-style messages:

```
feat: add org soft-delete danger zone
fix: prevent cross-org mutation in shift updates
refactor: extract audit logging into shared utility
docs: update RBAC permission table to 26 permissions
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

All coding standards (React, Next.js, security, writing) are documented in [blueprint/context/coding-standards.md](blueprint/context/coding-standards.md), with per-area conventions in the `AGENTS.md` files (`apps/web`, `apps/mobile`, `packages/`, `supabase/`). Key rules:

- **Server Components by default** - only add `'use client'` when the component requires browser APIs, event handlers, or React hooks.
- **No `useEffect` for derived state** - compute inline or use `useMemo`.
- **React Query for data fetching** - no raw `useEffect` + `fetch` for server data.
- **Validate inputs at server boundaries** - Zod schemas on all Route Handlers (the app uses no Server Actions).
- **Never expose secrets** - no `NEXT_PUBLIC_` prefix on server-only variables.
- **No em dashes in prose** - docs, comments, and commit messages use a hyphen, comma, colon, or parentheses instead (see the Writing section of `coding-standards.md`).
- **Busy buttons** - an async action button latches with `useAsyncAction` and shows a spinner in place of its icon with the label unchanged; `design/require-busy-button` enforces it.

---

## Monorepo and Workspace Conventions

DubGrid is an npm-workspaces monorepo orchestrated by Turborepo. Put code in the right place:

- **`apps/web`** (`@dubgrid/web`) — Next.js 16 web app. Pages, API Route Handlers, web-only components and hooks, server-side `lib/db/`. All former repo-root `src/...` paths now live under `apps/web/src/...`.
- **`apps/mobile`** (`@dubgrid/mobile`) — Expo / React Native app (Expo Router). Mobile features and shared UI. Talks only to `/api/mobile/v1/*` on the web app; never imports from `apps/web` directly.
- **`packages/*`** — 11 platform-neutral shared workspaces: `api-client`, `authz`, `client-errors`, `contracts`, `data-access`, `db-types`, `design-tokens`, `domain`, `mobile-api-core`, `realtime-core`, `schedule-core`.

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

Database history is an immutable, ordered migration stream under `supabase/migrations/`:

| File                                            | Contents                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `001_schema.sql` through `004_grants.sql`       | Frozen historical baseline (schema, functions, RLS, grants) |
| `005_*.sql` and later (currently through `023`) | One retry-safe forward migration per schema change          |
| `checksums.sha256`                              | Locks every reviewed migration                              |

**Every schema change is a new `NNN_snake_case.sql` at the next number.** Make it idempotent, add its hash to `checksums.sha256` in the same change, and run `npm run db:migrations:check`. Never edit an applied migration (including `001`-`004`), and never replay `supabase/patches/` as a migration stream. See [supabase/AGENTS.md](supabase/AGENTS.md).

When adding a table that the JWT hook reads, grant it to `supabase_auth_admin` in the new migration and test via `signInWithPassword`, not just direct SQL.

### Routes

All web routes must be **simple page files** (e.g., `apps/web/src/app/(app)/people/page.tsx`). Catch-all routes (`[...slug]`) break static prerendering on Vercel. Do not introduce them.

### Naming

- `gridmaster` = `platform_role`. Route: `/gridmaster`. Never call it "admin portal."
- `admin` = `org_role` (tier 2). Per-user configurable permissions.
- Tenant = "Organization" in all user-facing copy. Never "workspace" (except the `workspace_kind` DB column). URL identifier = "subdomain" in copy.

### Cookie Consent

When adding or removing cookies, or changing analytics providers, bump `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx` **and** `apps/mobile/src/features/consent/lib/consent.ts` (currently `"1.2"`). This re-prompts all existing users to re-consent on their next visit.

### Design System

`dg-btn-*` is the one button vocabulary everywhere (the old `dg-auth-submit` pill is retired; the class survives only as a full-width layout modifier on auth submit buttons). Input and label vocabularies are not interchangeable:

- **`dg-input` / `dg-label` / `dg-form-error`** - inside the authenticated app (schedule, people, settings, profile, dashboard, reports).
- **`dg-auth-input` / `dg-auth-link` / `dg-auth-heading`** - public auth flows only (login, forgot-password, reset-password, accept-invite), paired with `<AuthCard>`.

Product UI uses Inter; DM Sans is reserved for the wordmark and landing headings. On mobile, every number comes from the `mobile*` token ramps and every text goes through `shared/components/Text` (both lint-enforced). See `apps/web/AGENTS.md` and `apps/mobile/AGENTS.md`.

---

## Testing

- Run `npm test` before opening a PR (Vitest + Testing Library, jsdom environment). The pre-push hook runs it for you.
- Run `npm run test:e2e` for UI-impacting changes (Playwright; `npx playwright install chromium firefox webkit` once).
- No browser required for unit tests — jsdom handles the DOM environment.
- Add tests for new hooks, utility functions, and permission logic.
- Several agent sessions may run against one checkout: re-run a suspect test file in isolation before treating a full-suite timeout as a regression (`npx turbo run test --concurrency=1` serializes the workspaces).

---

## Database Changes

When modifying the schema:

1. Add a new `NNN_name.sql` at the next number and lock it in `supabase/migrations/checksums.sha256`.
2. Run `npm run db:reset` to verify the full sequence applies cleanly locally, then `npm run db:migrations:check`.
3. Run `npm run gen:types` if the change affects `apps/web/src/lib/database.types.ts`.
4. If your change affects the JWT hook, test via `signInWithPassword` (not just direct SQL).
5. If adding a table the hook reads, grant it to `supabase_auth_admin` in the same migration.
6. If removing or renaming a table/column, carry the RLS policy and grant changes in that migration too, and keep `npm run db:migrations:inspect:local -- --expect-complete` green.

See [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md) for the full security model.

---

## Emails

Email templates are react-email components in `apps/web/src/emails/`. After editing a template, regenerate the Supabase HTML files:

```bash
npm --workspace @dubgrid/web run email:build
```

This runs a Vitest script that outputs compiled HTML to `supabase/templates/`.
