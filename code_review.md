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
- **Migration rule**: `001`-`004` are a frozen baseline. Every schema change is a new, idempotent `NNN_name.sql` at the next number, locked in `supabase/migrations/checksums.sha256`. Reject a PR that edits an applied migration, skips the checksum, or reapplies `supabase/patches/`.
- **Route rule**: all web routes must be simple page files (e.g., `apps/web/src/app/(app)/people/page.tsx`). Catch-all routes (`[...slug]`) break static prerendering on Vercel and must not be introduced.
- **Mobile API isolation**: `apps/mobile` must not import from `apps/web` or touch Supabase data tables directly. All data access goes through `/api/mobile/v1/*`.

---

## Security Checklist

- [ ] All mutation endpoints call `validateCsrfOrigin` before processing the body.
- [ ] All Route Handlers validate input with Zod before using it (the app uses no Server Actions; a new one would need the same review).
- [ ] Authenticated endpoints call `requireAuthenticatedUser` or `requireOrgPermissions` before touching data. Session checks are inside the handler, not only in the request proxy.
- [ ] `requireOrgPermissions` returns the effective (sandbox-redirected) `orgId`. Mutations use that value, never a raw client-supplied `orgId`.
- [ ] Destructive org mutations call `forbidIfSandboxCookie` to block sandbox-to-production escalation.
- [ ] Self-action guards: no user can demote, bench, terminate, or remove their own account. Verify the `isSelfAction` check exists in new people-management code.
- [ ] Admin tier guards: admins cannot modify or assign admin/super_admin/gridmaster roles. New role-change code must respect this.
- [ ] All UPDATE queries include an `org_id` WHERE clause (cross-org mutation prevention).
- [ ] No secrets, stack traces, or internal error details are returned to clients.
- [ ] Rate limiters are applied to public-facing and email-sending endpoints.
- [ ] New email-sending routes apply `emailTargetLimiter` per recipient address.
- [ ] A new sensitive action (factor or credential change, session revocation, export, deletion, irreversible org change) calls `requireSensitiveActionAuth` (web) or `requireMobileSensitiveActionAuth` (mobile) and the UI drives the step-up flow.
- [ ] Public identity-facing failures stay generic (no account, invitation, or factor existence leaks); security outcomes go through `lib/auth/security-audit.ts` without secrets.
- [ ] A new mutating route is classified in `__tests__/auth-integrity-entry-points.test.ts` (browser CSRF, native bearer, or signed/webhook boundary).

---

## Design System and Copy Checklist

- [ ] Authenticated app UI uses `dg-btn-*`, `dg-input`, `dg-label`, `dg-form-error` (not `dg-auth-*`).
- [ ] Buttons use `dg-btn-*` everywhere; auth-flow inputs and links use `dg-auth-input`, `dg-auth-link`, `dg-auth-heading` (never the retired `dg-auth-submit` pill as a button style).
- [ ] Async action buttons latch with `useAsyncAction` and show a spinner with the label unchanged (no `loadingLabel`, no relabel).
- [ ] Integer fields use `<NumberField>`, never `type="number"`; selects use `<CustomSelect>`, never a native `<select>`.
- [ ] Empty states use `<EmptyState size="...">` (not hand-rolled divs or the removed `DashboardEmptyState`).
- [ ] Shared layout primitives are used where applicable: `<PageContainer>`, `<Switch>`, `<EditorActionRow>`, `<SectionCard>`, `<ConfirmDialog>`, `<Modal>`, `<NumericBadge>`, `<StatusPill>`.
- [ ] Mobile: numbers come from the `mobile*` token ramps (`design/no-raw-mobile-metrics`), text goes through `shared/components/Text` with the right `fit` tier, and choices render as grouped lists (`ProfileChoiceGroup`), not chip clouds or dropdowns.
- [ ] Typography: Inter for product UI, DM Sans only for the wordmark and landing headings, `dg-tabular-nums` / `mobileTabularText` on operational figures only.
- [ ] Error and not-found segments delegate to `<ErrorBoundary>` and `<NotFoundBoundary>` from `components/RouteBoundary.tsx`.
- [ ] User-facing copy follows the tone guide: no em-dashes (replace with commas, parentheses, or colons), no "workspace" for the tenant (use "Organization"), no "admin portal" for the gridmaster portal, "subdomain" for the URL identifier.
- [ ] Cookie consent: if cookies are added/removed or an analytics provider changes, `CONSENT_VERSION` is bumped in both `apps/web/src/components/CookieConsent.tsx` and `apps/mobile/src/features/consent/lib/consent.ts`.

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
