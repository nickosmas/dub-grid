# Fix: Clear the open Dependabot alerts without churning the lockfile

**Type:** Fix
**Status:** verified
**Records:** F-123, F-124, F-125, F-126

## The problem

Fourteen Dependabot alerts were open on 2026-09-28 across eight packages.
None were on the web server's runtime path.

| Package                    | Severity | Alerts   | Where the vulnerable copy sat                                                           |
| -------------------------- | -------- | -------- | --------------------------------------------------------------------------------------- |
| `image-size` 1.2.1         | high     | 193, 194 | Metro, under `@expo/metro` and `@react-native/community-cli-plugin` (bundler only)      |
| `js-yaml` 3.15.1 and 4.3.1 | high     | 191, 192 | `react-native > babel-jest` istanbul config; `expo > @expo/cli > @expo/xcpretty`        |
| `fast-uri` 3.1.5           | high     | 176-181  | `@sentry/nextjs > webpack > schema-utils > ajv`; `react-email > conf > ajv` (build/dev) |
| `@faker-js/faker` 8.4.1    | high     | 175      | `@snaplet/seed > @snaplet/copycat` (seed tooling)                                       |
| `decode-uri-component`     | medium   | 174      | `query-string` 7 under `expo-router` and React Navigation (mobile deep links)           |
| `vitest`, `@vitest/mocker` | medium   | 185, 186 | test runner                                                                             |
| `hono` 4.13.0              | medium   | 182, 183 | `shadcn > @modelcontextprotocol/sdk` (dev)                                              |

Most root `overrides` already asked for fixed versions. Under
`install-strategy=nested`, npm does not re-apply them to nodes inside a
workspace subtree, and the only thing that ever applied them was a full clean
reinstall, which is now banned.

## The fix

One commit per change, each resolved with `npm install --package-lock-only`
under the project's npm 10.9.2 and reviewed by lock diff:

- **hono:** the root override pinned 4.13.0 exactly; it now pins 4.13.8, the
  newest release outside the 7-day freshness window. 6 lock lines.
- **expo 54.0.36 to 54.0.37:** brings `@expo/cli` 54.0.27 and re-resolves
  xcpretty's js-yaml to 4.3.2. Re-resolving expo's subtree silently
  dropped three overrides (undici to 6.29.0, uuid to 7.0.3, postcss to
  8.4.49) and took `ws` and `browserslist` releases inside the cooldown
  window. Those five entries were restored from the previous lock. About 400
  lines, all inside expo's subtree.
- **js-yaml 3.15.1 to 3.15.2** under `@istanbuljs/load-nyc-config`, and the
  **two fast-uri copies 3.1.5 to 3.1.7**: no parent bump reaches these leaves.
  webpack is a satisfied peer under `@sentry/nextjs` (a Sentry bump moved 300
  lines and left it alone), `conf` and `ajv` are already their newest
  releases, and the React Native patch that would re-resolve babel-jest is
  outside Expo SDK 54's pinned 0.81.5. Each entry now carries the registry's
  tarball and integrity for the version the override asks for, with an
  unchanged dependency set.

Every hand-set or restored entry was checked the same way: a second
`npm install --package-lock-only` leaves the lock byte-identical, so npm
accepts it as resolved. The js-yaml and fast-uri audit allowlist entries,
and fast-uri's SECURITY.md mention, were removed, since a stale entry fails
`deps:audit`. The image-size entry's reason now records why the new 2.0.3
fix cannot be used.

## Not fixable without a major upgrade

- **F-123 image-size:** 2.0.3 accepts only a buffer, but Metro 0.83.3 passes
  it a file path, and `@expo/metro` 54.2.0 pins that Metro. It waits for the
  Expo SDK upgrade.
- **F-124 decode-uri-component:** the fix is ESM-only, but query-string 7
  `require()`s it, and even the newest expo-router still uses query-string 7.
- **F-125 vitest:** fixed only in 4.1.11, a major upgrade.
- **F-126 faker:** `@snaplet/copycat` 6.0.0 is still copycat's newest release
  and pins faker ^8.4.1.

## Verification

Run from this fix's worktree over its own clean `npm ci --ignore-scripts`:

- `npm run deps:rebuild`, `npm run deps:scan`, `npm audit signatures` (8,506
  verified registry signatures), and
  `npm run deps:scan -- --freshness --since=origin/main` (no version inside
  the cooldown window)
- `npm run deps:audit`: no unreviewed vulnerabilities at high or above (four
  allowlisted: faker via copycat and seed, and image-size)
- `npm run type-check`, `npm run lint` (0 errors, 3 existing warnings),
  `npm run test:mobile` (15 of 15 tasks; mobile 1,406 tests), and
  `npm run build` (11 of 11 tasks)
- `npm run test:web`: 5,200 passed, 9 failed. All nine sit in three live-DB
  files (`schedule-notes-per-shift`, `schedule-notes-leave-with-shift`,
  `draft-state-editor-only`). They fail on `schedule_notes.job_id` NOT NULL
  or a missing `schedule_notes_segment_key_check`, because migration 068 was
  applied to the shared local database ahead of the test fixes, not because
  of any dependency change.

The five commits reached `dev` as e0643725..2380238f and ride release PR
#124.

## How to try it

After #124 merges into `main`, run
`gh api "repos/nickosmas/dub-grid/dependabot/alerts?state=open"`. The js-yaml
(191, 192), fast-uri (176, 177, 180, 181) and hono (182, 183) alerts close
when Dependabot rescans `main`. Image-size, faker, decode-uri-component and
vitest stay open, each tracked by its finding.
