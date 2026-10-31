# Fix: Clear the dependency audit gate (October)

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-31
**Branch:** `fix/dependency-audit-gate` (worktree `.claude/worktrees/audit-gate`)

### The problem

`npm run deps:audit` failed with 24 unreviewed advisories at high or critical
and 3 stale allowlist entries. The weekly run on `main` had been red since
2026-10-26, and the Dependency Audit workflow runs on every pull request that
changes a manifest, so no dependency change could merge. It held back the
persisted mobile cache (F-181, `fix/mobile-persisted-cache`).

Two of the advisories reach production directly:

- `next` 16.3.8: two unauthenticated remote code execution advisories (SVG
  image optimization, `use cache` returning typed arrays) and a Server
  Actions denial of service (critical).
- `@sentry/nextjs` 10.69.0: a middleware bypass through the tunnel route
  (critical). `apps/web/next.config.ts` sets `tunnelRoute: "/monitoring"`, so
  it applies.

### The fix

The lockfile procedure from `dependency-audit-gate.md` and
`dependency-alerts.md`, with npm 10.9.2 on Node 22: no `npm audit fix`, no
lock wipe, only the vulnerable entries move, and a second
`npm install --package-lock-only` must leave the lock byte-identical.

1. **Production packages through the manifest:**
   - `next` 16.3.8 → 16.4.3 (`apps/web`, both root overrides).
   - `@sentry/nextjs` → 10.76.2, pinned exactly (`apps/web`).
   - `dompurify` override → 3.4.17 (both overrides; under `posthog-js`).
   - `undici` override → `^7.30.1`; `vite` devDependency → `^7.3.7`.
   - A plain re-resolve moved 401 entries, pulled Sentry 10.78.0 (too
     fresh), dropped postcss below its override and added a second Next.js
     16.2.6 under `@react-email/ui`. So the lock was resolved with
     `--before=2026-10-24`, and only the `next`/`@next/*` entries, the
     `@sentry/*` subtree, `vite` and shadcn's `undici` were taken from it;
     next's overridden postcss 8.5.25 was kept.
2. **Leaf bumps** (overrides do not reach nested workspace nodes):
   `dompurify` 3.4.17 under `posthog-js`, `undici` 7.30.1 under `@expo/cli`,
   `@modelcontextprotocol/sdk` 1.32.1, `body-parser` 2.4.0 (with its
   `content-type` 2.1.0) and `systeminformation` 5.33.16 under shadcn.
3. **Allowlist** in `scripts/audit-check.mjs`, each with a reason and date:
   - **Inside the 7-day freshness window:** `follow-redirects` (seed CLI
     telemetry; take 1.16.2 after 2026-11-01, review 2026-11-08) and
     `node-forge` (Expo CLI code signing, unused; take 1.4.2 after
     2026-11-03, review 2026-11-10).
   - **Majors the callers cannot take:** `decode-uri-component` (mobile deep
     links; ESM-only fix, F-124), glob/minimatch/deepmerge in Expo config,
     seed and shadcn tooling (F-127), Vitest (F-125, a fourth advisory added,
     still 2026-11-15), and zod (F-189, new: it reaches production request
     validation, bounded by Vercel's 4.5 MB body cap; the fix is zod 4).
   - `image-size` re-dated to 2026-12-01 (F-123). The `braces` and
     `sprintf-js` entries were removed: their advisories are gone from
     `npm audit`.

### Verification evidence

- `npm run deps:audit`: passes, 16 allowlisted, none unreviewed.
- Lockfile: 341 entries moved from `dev`'s, all intended (`next` with
  `@next/*`, the `@sentry/*` subtree, `vite`, two `undici`, the five leaves
  and one `content-type`). A second lock-only install leaves it
  byte-identical. Install scripts 16 → 15.
- `npm run deps:scan` and `-- --freshness --since=origin/dev`: pass, nothing
  inside the cooldown window.
- Clean install (`npm ci --ignore-scripts`, `npm run deps:rebuild`):
  `next` 16.4.3 and `@sentry/nextjs` 10.76.2 installed; `npm audit
signatures` verified 8,383 packages and 998 attestations.
- Gates on the clean install: `npm run type-check`, `npm run lint`,
  `npm run build` (11/11, Next.js 16.4.3) and `npm run test` (23/23 tasks;
  web 7,098, mobile 1,543) pass. Playwright runs on the pull request.

### Follow-ups

- Take `follow-redirects` 1.16.2 after 2026-11-01 and `node-forge` 1.4.2
  after 2026-11-03, then delete those entries.
- F-125 (Vitest major) before 2026-11-15; F-189 (zod 4) before 2026-12-01.
- Rebase and ship `fix/mobile-persisted-cache` (F-181).
