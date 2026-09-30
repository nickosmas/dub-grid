# Fix: Client documentation organization language

**Type:** Fix

**Status:** verified

## The problem

The customer documentation must read as a training manual for organization
managers. Some structural wording refers broadly to organizations instead of
the reader's organization, and the documentation authoring guidance still
names an internal-only platform role. Neither pattern belongs in client-facing
material.

## The fix

Use second-person language that centers the reader's organization. Mention
multiple organizations only where a reader is switching between organizations
or otherwise using more than one. Remove the internal-role name from the
customer documentation guidance and retain DubGrid or DubGrid support as the
appropriate public-facing reference.

## Build steps

- [x] Align the customer documentation guidance and introductory organization
      copy with manager-focused, second-person language. Keep references to
      multiple organizations only where a reader can use more than one. Done when
      no client-facing structural copy describes the platform as a collection of
      organizations, and future documentation guidance enforces the same boundary.
- [x] Review the invitation and onboarding wording for unnecessary references
      to other organizations, then update only the client copy that falls outside
      the new boundary. Done when those flows explain the reader's organization
      without exposing internal platform terminology.
- [x] Review role guidance for unnecessary cross-organization examples, then
      keep only the organization-specific role explanation a manager needs. Done
      when the role guide stays accurate without discussing other organizations.

## Verify

- Search published `docs/**/*.mdx` for restricted internal terminology,
  multi-tenant language, and organization-structure wording.
- Run `npm run docs:verify` to validate the closed documentation contract,
  Mintlify configuration, and links.
- Review the changed introduction, quickstart, onboarding, and invitation
  pages as a manager-facing training path.
