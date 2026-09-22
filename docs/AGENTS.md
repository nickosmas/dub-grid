# Documentation project instructions

Customer-facing DubGrid documentation, published by Mintlify from this folder.
Engineering reference, runbooks, and operational material live in `internal/`
and are never published.

## About this project

- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links
- Mintlify deploys from `main`, so a page ships when a release PR merges

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
