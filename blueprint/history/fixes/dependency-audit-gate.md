# Fix: Clear the dependency audit gate

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-14

### The problem

`npm run deps:audit` fails with 45 unreviewed advisories at high or critical.
The scheduled run on `main` has been red since at least 2026-10-05. It now
blocks release PR #131, because that PR touches `package.json` and so
triggers the audit workflow. 40e2 itself changed no dependency.

The advisories trace to 15 leaf packages:

| Leaf (copies)                    | Worst    | Where it runs                             | Fix                     |
| -------------------------------- | -------- | ----------------------------------------- | ----------------------- |
| `next` 16.3.5 (1)                | critical | web production (also `@react-email/ui`)   | 16.3.8 (2026-09-30)     |
| `sharp` 0.35.4 (1)               | high     | web production, under `next`              | 0.35.5 (2026-09-27)     |
| `axios` 1.19.0 (1)               | high     | web production, under `posthog-node`      | 1.20.0 (2026-08-26)     |
| `source-map-js` 1.2.1 (10)       | high     | web build (`next` postcss), mobile, dev   | 1.2.2 (2026-09-30)      |
| `undici` 7.29.0 (2)              | high     | `@expo/cli`, `shadcn`                     | 7.29.1 (2026-09-04)     |
| `shell-quote` 1.10.0 (1)         | critical | `react-devtools-core` (mobile dev)        | 1.11.0 (2026-09-29)     |
| `proxy-addr` 2.0.7 (1)           | critical | `shadcn` MCP server (dev)                 | 2.0.8 (2026-09-15)      |
| `engine.io` 6.6.9 (1)            | high     | `react-email` preview server (dev)        | 6.6.10+                 |
| `@modelcontextprotocol/sdk` 1.30 | high     | `shadcn` (dev)                            | 1.31.0 (2026-09-28)     |
| `brace-expansion` (19)           | high     | glob/minimatch in build and dev tools     | 1.1.21, 2.1.7, 5.0.12   |
| `braces` 3.0.3 (7)               | high     | micromatch in Metro, Jest, ESLint, shadcn | none published          |
| `node-forge` 1.4.0 (1)           | high     | `@expo/cli` code signing (build)          | none published          |
| `sprintf-js` 1.0.3 (1)           | moderate | `argparse` 1.x under Jest (mobile build)  | none in range           |
| `tinypool` 1.1.1 (1)             | critical | Vitest 3 workers (tests only)             | 2.1.2+, needs Vitest 4+ |
| `@vitest/mocker` 3.2.7 (1)       | moderate | Vitest 3 (tests only)                     | needs Vitest 4.1.11+    |

Every fixed version is older than the 7-day freshness window.

### The fix

Follow the lockfile procedure from `blueprint/history/fixes/dependency-alerts.md`:

- Use npm 10.9.2.
- Never `npm audit fix`, and never wipe the lock.
- Move only the vulnerable entries.
- Prove the result with a second `npm install --package-lock-only` that leaves
  the lock byte-identical, plus `npm audit signatures` and `npm run deps:scan`.

1. **Production packages through the manifest:**
   - `next` 16.3.5 → 16.3.8 in the root pin, both root overrides and
     `apps/web`.
   - The `axios` override → 1.20.0.
   - The `sharp` override → `^0.35.5`.
2. **Leaf lock bumps** where the fixed version keeps the same dependency set:
   `source-map-js`, `undici`, `shell-quote`, `proxy-addr`, `engine.io`,
   `brace-expansion` (per major) and `@modelcontextprotocol/sdk`.
   - Point each vulnerable lock entry at the fixed version's tarball and
     integrity.
   - Restore any overridden pin a re-resolve drops.
3. **Allowlist the rest in `scripts/audit-check.mjs`**, each with a concrete
   reason and a `reviewBy` date:
   - **`braces` and `node-forge`:** no fixed release exists.
   - **`sprintf-js`:** the fix is outside `argparse` 1's range.
   - **`tinypool` and `@vitest/mocker`:** fixing them needs the Vitest major
     (F-125). These run only on developer machines and CI, over our own tests.
   - Re-date F-125, and add a finding for the Expo SDK chain if one is not
     already tracked.

**Must not break:**

- Web build, type-check, the full test suite and the mobile tests.
- No overridden pin regresses.
- No package newer than the freshness window.
- No new install scripts.

### Build steps

1. [x] **Production packages.** Bump `next`, `axios` and `sharp` as above.
   - Done when:
     - the lock diff touches only `next`, `@next/*`, `sharp`, `@img/*` and
       `axios` entries
     - a second lock-only install leaves the lock byte-identical
     - `npm run build` passes on a clean install of the new lock
2. [x] **Leaf bumps.** Move every fixable leaf copy.
   - Done when:
     - `deps:audit` lists only `braces`, `node-forge`, `sprintf-js`,
       `tinypool` and `@vitest/mocker` chains
     - the lock re-resolves byte-identically
     - `npm audit signatures` and the freshness scan pass
3. [x] **Allowlist and record.** Add the reviewed allowlist entries and update
       the findings ledger.
   - Done when `npm run deps:audit` passes.
   - It must also pass `type-check`, `lint`, `test` and `build`.

### Verify

- `npm run deps:audit` is green locally and on PR #131.
- `npm run type-check`, `npm run lint`, `npm run test` and `npm run build`
  pass in the worktree.

### Verification evidence

- **`npm run deps:audit`:**
  - Before: 45 unreviewed advisories at high or above.
  - After: passes, with 36 copies allowlisted, each under a reviewed entry.
- **Lockfile (npm 10.9.2):**
  - 74 entries moved, every one to its intended version:
    - `next` with `@next/*` (10), `sharp` with `@img/*` (28), `axios`
    - `brace-expansion` (19), `source-map-js` (10), `undici` (2)
    - `shell-quote`, `proxy-addr`, `engine.io`, `@modelcontextprotocol/sdk`
  - A second `npm install --package-lock-only` leaves it byte-identical.
  - The only dependency-set change is `engine.io` 6.6.10 dropping `base64id`,
    which `socket.io` still uses.
  - No new install scripts (16 before and after).
- **Clean install** (`npm ci --ignore-scripts` plus `deps:rebuild`):
  - `next` 16.3.8 and `sharp` 0.35.5 are installed.
  - `npm audit signatures` verified 8506 packages.
  - `npm run deps:scan` and `deps:scan -- --freshness --since=origin/dev`
    (44 new versions) pass.
- **Gates:**
  - `npm run type-check`, `npm run lint` and `npm run build` (11/11, Next.js
    16.3.8) pass, as does `npm run docs:check:closed`.
  - `npm run test` passes: 23/23 tasks; web 5566, mobile 1407.
- **Environment note:** the first full run failed four live-DB tests in
  `org-isolation`, `per-session-org` and `mfa-enforced-in-policies`.
  - Cause: Docker Desktop's disk went read-only, and the shared Supabase
    answered "Database error querying schema" and 504s.
  - After a Docker restart, those files passed 14/14 and the full suite
    passed.
- **Not run:** `npm run test:e2e`; PR #131's Playwright jobs run it.

### Follow-ups

- **F-125:** take the Vitest major before 2026-11-15, when its allowlist entry
  expires.
- **F-127 and F-123:** the Expo SDK upgrade clears `braces`, `node-forge`,
  `sprintf-js` and `image-size` from the mobile toolchain.
