# Fix: the dependency audit reviews picomatch's ReDoS advisory

**Type:** Fix
**Status:** verified
**Branch:** `fix/audit-picomatch`

### The problem

GHSA-fc5q-39xc-vjpf (picomatch: super-linear matching of single-branch
repeated extglobs, every version up to 4.0.7) was published on 2026-11-17 and
turned the `npm audit` check red on every pull request: 51 packages carry it.
Because an allowlisted package must have every advisory behind it reviewed,
the glob, minimatch and deepmerge entry also stopped matching and read as
stale.

### The fix

A reviewed allowlist entry in `scripts/audit-check.mjs`, due 2026-12-01. No
fixed release exists, and every copy runs in build, lint, test or developer
tooling over globs we write (Metro, the Expo CLI, React Native's codegen and
CLI, ESLint and typescript-eslint, Vite and Vitest, the shadcn CLI,
@snaplet/seed, Sentry's Next.js build plugin, next-intl's development file
watcher); none is in the mobile bundle or on a web request.

### Verify

- `node scripts/audit-check.mjs`: no unreviewed vulnerabilities at high or
  above (52 allowlisted), and no stale entries.
