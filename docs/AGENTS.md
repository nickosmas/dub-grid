# Documentation project instructions

Customer-facing DubGrid documentation, published by Mintlify from this folder.
Engineering reference, runbooks, and operational material live in `internal/`
and are never published.

## About this project

- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Run `npx -p mint@4.2.942 -p openapi-types@12.1.3 mint dev` from this folder
  to preview locally. Keep the version in step with the root `docs:*` scripts;
  `openapi-types` works around a dependency Mint's bundle omits.
- Mintlify deploys from `main`, so a page ships when a release PR merges

## Verification commands

Run documentation checks from the repository root:

- `npm run docs:inventory` regenerates the committed source inventory. Run it
  only when intentionally accepting a source change.
- `npm run docs:check` performs the fast, read-only documentation contract
  check.
- `npm run docs:check:closed` performs the same check and rejects a planned,
  pending, or otherwise unverified manifest entry.
- `npm run docs:validate` runs Mintlify configuration and MDX validation.
- `npm run docs:links` runs Mintlify's broken-link check.
- `npm run docs:verify` runs the strict contract, Mintlify validation, and
  broken-link checks in release order. It never regenerates the inventory.

Do not edit generated files under `internal/documentation/generated/` by hand.
Do not present a pending or planned manifest entry as verified current truth.

## Audience

Write for the people who use DubGrid: staff checking a schedule, managers
building one, and super admins configuring an organization. Assume no
knowledge of the codebase.

## Terminology

- Write **Organization**, never "workspace" and never the abbreviation "org".
  `org` is a code identifier only.
- Several labels are customizable per organization. Name the default, and say
  it is configurable rather than presenting it as fixed: Focus Areas (formerly
  Wings), Certifications (formerly Skill Levels), shift codes, absence types,
  and role labels.
- **Gridmaster** is the platform-team role. Never call it an admin portal.
- Roles are Gridmaster, Super Admin, Admin, and User. Admin access is a
  per-person set of permissions granted individually, not a role template.

## Content boundaries

- Do not document Gridmaster tooling, impersonation, audit-log internals, or
  tenant lifecycle. Those are platform-team surfaces, not customer features.
- Do not document the test sandbox, feature flags, or internal APIs.
- Reports, billing, the permissions editor, and organization settings are
  deliberately web-only. Say so where it matters instead of describing a
  mobile equivalent that does not exist.
- Never reference environment variables, migrations, project refs, or anything
  from `internal/`.

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise, one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- No em dashes. Use a comma, parentheses, a colon, or rephrase.

## Accuracy

This folder was seeded by Mintlify's one-time scan of the codebase, which
produced some confident but wrong statements. Verify behavior against the app
or the source before documenting it, and treat an existing page as a draft
rather than a reference.
