# DubGrid — API Reference

DubGrid uses a thin API surface. Most CRUD operations go directly through the Supabase client (RLS-protected). API routes handle operations that require server-side logic, external service calls, or public access.

---

## Authentication

All authenticated endpoints require a valid Supabase session cookie (`sb-*-auth-token`). The middleware verifies JWT claims and injects `x-dubgrid-role`, `x-dubgrid-org-id`, and `x-dubgrid-org-slug` headers.

---

## Endpoints

### Public

| Method | Path | Purpose | Rate Limit |
| ------ | ---- | ------- | ---------- |
| GET | `/api/validate-domain` | Check if org subdomain slug exists | IP-based |
| POST | `/api/request-demo` | Demo request form submission (landing page) | IP-based |
| POST | `/api/auth/login` | Supabase email/password authentication | IP-based |
| POST | `/api/consent` | Record cookie consent preference | IP-based |
| GET | `/api/health` | Health check endpoint | None |

### Authenticated — Auth & Account

| Method | Path | Purpose | Rate Limit |
| ------ | ---- | ------- | ---------- |
| POST | `/api/auth/track-session` | Record per-device session for analytics | None |
| POST | `/api/auth/delete-account` | Delete user account (GDPR right to erasure) | User-based |
| POST | `/api/auth/gdpr-erase` | Full data anonymization (GDPR compliance) | User-based |
| GET | `/api/auth/data-export` | Download all personal data (GDPR portability) | User-based |

### Authenticated — Schedule & Data

| Method | Path | Purpose | Rate Limit |
| ------ | ---- | ------- | ---------- |
| GET | `/api/calendar` | iCalendar export (.ics) of employee schedule | User-based |
| GET | `/api/export` | Schedule export (PDF/CSV format) | User-based |
| POST | `/api/import/employees` | Bulk employee import from CSV | User-based |
| POST | `/api/send-notification` | Dispatch in-app/email notification | User-based |

### Authenticated — Invitations & Impersonation

| Method | Path | Purpose | Rate Limit |
| ------ | ---- | ------- | ---------- |
| POST | `/api/send-invite-email` | Send invitation email via Resend | User-based |
| POST | `/api/notify-impersonation` | Log impersonation start/end events | User-based |

### Authenticated — Stripe Billing

| Method | Path | Purpose | Rate Limit |
| ------ | ---- | ------- | ---------- |
| POST | `/api/stripe/create-checkout` | Create Stripe checkout session | User-based |
| POST | `/api/stripe/billing-portal` | Redirect to Stripe billing portal | User-based |
| POST | `/api/stripe/webhook` | Stripe webhook handler (signature verified) | None |

### Gridmaster Only

| Method | Path | Purpose | Rate Limit |
| ------ | ---- | ------- | ---------- |
| POST | `/api/gridmaster/delete-org` | Delete an organization | User-based |
| POST | `/api/gridmaster/password-reset` | Force password reset for any user | User-based |
| POST | `/api/gridmaster/stripe-sync` | Sync Stripe subscription data | User-based |
| POST | `/api/gridmaster/subscription` | Manage org subscription tier | User-based |

### Supabase RPCs (Database Functions)

| RPC | Purpose | Auth |
| --- | ------- | ---- |
| `change_user_role` | Change user's org role (idempotent, advisory-locked) | Authenticated (admin+) |
| `switch_org` | Switch user's active organization | Authenticated |
| `start_impersonation` | Begin gridmaster impersonation session | Gridmaster only |
| `end_impersonation` | End active impersonation session | Gridmaster only |
| `expand_recurring_shifts` | Materialize recurring templates into shifts | Authenticated (admin+) |
| `apply_shift_series` | Batch-generate shifts from series templates | Authenticated (admin+) |
| `gdpr_erase_user_data` | Anonymize all user data | Service role |
| `force_logout_user` | Terminate all sessions for a user | Gridmaster only |

---

## Rate Limiting

Rate limits are enforced via Upstash Redis (`src/lib/rate-limit.ts`):

| Limiter | Scope | Window | Limit |
| ------- | ----- | ------ | ----- |
| `apiLimiter` | IP-based | Sliding window | General API protection |
| `inviteLimiter` | User-based | Sliding window | Invitation abuse prevention |
| `demoLimiter` | IP-based | Sliding window | Demo form spam prevention |

Rate-limited responses return HTTP 429 with a `Retry-After` header.

---

## Security

All API routes include:
- **Input validation** via Zod schemas
- **CSRF protection** via Origin header validation (mutation endpoints)
- **HTML sanitization** via `escapeHtml()` and `sanitizeHeaderValue()` (email-sending routes)
- **Auth verification** — session checked before any data access
- **Org scoping** — all queries filter by the authenticated user's `org_id`

For the full security model, see [RBAC_SYSTEM_DESIGN.md](../RBAC_SYSTEM_DESIGN.md).

---

_DubGrid — Confidential_
