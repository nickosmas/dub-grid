# code_review.md

Use this guide whenever Claude is asked to review code in this repository.
Review for concrete, evidence-backed risks first. Do not nitpick style unless
it affects readability, consistency, correctness, or maintainability.

---

## Review Priorities

Review in this order:

1. Security issues
2. Tenant isolation issues (cross-org data leakage, sandbox-to-production escalation)
3. Data loss risks
4. Auth or permission regressions
5. Cross-app breakage between `apps/web` and `apps/mobile`
6. Shared package breaking changes (`packages/*` affects both apps)
7. API contract changes (web routes + `/api/mobile/v1/*`)
8. Database migration risks
9. Missing tests
10. Accessibility issues
11. Performance regressions
12. Maintainability concerns

---

## Monorepo-Specific Checks

Before approving any change, verify:

- **Package boundary**: shared `packages/*` must stay platform-neutral. No Next.js, Expo, React Native, DOM, or Node.js-only imports. Any such import in a package will break the other app.
- **Both apps**: a change to any `packages/*` workspace potentially affects both `apps/web` and `apps/mobile`. Confirm both still build and their tests pass.
- **Migration rule**: schema lives in exactly 4 files (`001_schema.sql` through `004_grants.sql`). If a PR creates a `005_...sql` or later file, reject it. New columns, functions, policies, and grants go in the appropriate existing file.
- **Route rule**: all web routes must be simple page files (e.g., `apps/web/src/app/people/page.tsx`). Catch-all routes (`[...slug]`) break static prerendering on Vercel and must not be introduced.
- **Mobile API isolation**: `apps/mobile` must not import from `apps/web` or touch Supabase data tables directly. All data access goes through `/api/mobile/v1/*`.

---

## Security Checklist

- [ ] All mutation endpoints call `validateCsrfOrigin` before processing the body.
- [ ] All Route Handlers and Server Actions validate input with Zod before using it.
- [ ] Authenticated endpoints call `requireAuthenticatedUser` or `requireOrgPermissions` before touching data. Session checks are inside the handler, not only in middleware.
- [ ] `requireOrgPermissions` returns the effective (sandbox-redirected) `orgId`. Mutations use that value, never a raw client-supplied `orgId`.
- [ ] Destructive org mutations call `forbidIfSandboxCookie` to block sandbox-to-production escalation.
- [ ] Self-action guards: no user can demote, bench, terminate, or remove their own account. Verify the `isSelfAction` check exists in new people-management code.
- [ ] Admin tier guards: admins cannot modify or assign admin/super_admin/gridmaster roles. New role-change code must respect this.
- [ ] All UPDATE queries include an `org_id` WHERE clause (cross-org mutation prevention).
- [ ] No secrets, stack traces, or internal error details are returned to clients.
- [ ] Rate limiters are applied to public-facing and email-sending endpoints.
- [ ] New email-sending routes apply `emailTargetLimiter` per recipient address.

---

## Design System and Copy Checklist

- [ ] Authenticated app UI uses `dg-btn-*`, `dg-input`, `dg-label`, `dg-form-error` (not `dg-auth-*`).
- [ ] Auth-flow UI uses `dg-auth-submit`, `dg-auth-input`, `dg-auth-link`, `dg-auth-heading` (not `dg-btn-*`).
- [ ] Empty states use `<EmptyState size="...">` (not hand-rolled divs or the removed `DashboardEmptyState`).
- [ ] Shared layout primitives are used where applicable: `<PageContainer>`, `<Switch>`, `<EditorActionRow>`, `<SectionCard>`, `<ConfirmDialog>`.
- [ ] Error and not-found segments delegate to `<ErrorBoundary>` and `<NotFoundBoundary>` from `components/RouteBoundary.tsx`.
- [ ] User-facing copy follows the tone guide: no em-dashes (replace with commas, parentheses, or colons), no "workspace" for the tenant (use "Organization"), no "admin portal" for the gridmaster portal, "subdomain" for the URL identifier.
- [ ] Cookie consent: if cookies are added/removed or an analytics provider changes, `CONSENT_VERSION` in `apps/web/src/components/CookieConsent.tsx` is bumped.

---

## Finding Format

For every confirmed issue, include:

- **Severity**: Critical, High, Medium, or Low
- **Affected area**
- **File and location**
- **What is wrong**
- **Why it matters**
- **Suggested fix**

---

## Review Rules

- Lead with findings, ordered by severity.
- Clearly separate confirmed issues from questions, assumptions, or follow-up checks.
- Do not report speculative issues as confirmed bugs.
- Do not claim a root cause unless the evidence supports it.
- Cite exact files, functions, commands, or test output used as evidence.
- If no issues are found, state what was reviewed and what was not reviewed.
- Mention relevant checks that were not run (e.g., "mobile build not verified").
