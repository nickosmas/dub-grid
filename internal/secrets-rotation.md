# Secrets Rotation Runbook

Quarterly rotation schedule. Each secret has a specific rotation procedure.

## Environment Variables Reference

All required and optional env vars are validated at startup by two Zod schemas:
`apps/web/src/lib/env.ts` for the `NEXT_PUBLIC_*` variables (reachable from the
browser bundle) and `apps/web/src/lib/env.server.ts` for server-only variables
(importing it also validates the public set). Together they enforce the following
at runtime:

**Always required (all environments):**

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Supabase public anon key (baked into client bundle)
- `SUPABASE_SECRET_KEY` - Server-only service role key (never `NEXT_PUBLIC_`)

**Required in production (`NODE_ENV=production` + `VERCEL_ENV=production` or `STRICT_PROD_ENV_VALIDATION=1`):**

- `UPSTASH_REDIS_REST_URL` - Rate limiter; fail-closed if absent (503)
- `UPSTASH_REDIS_REST_TOKEN` - Rate limiter token

**Optional (warn in dev, degrade gracefully):**

- `CRON_SECRET` - Bearer token for the scheduled jobs: the two `apps/web/vercel.json`
  crons (`trial-expiry`, `sandbox-cleanup`) and the `cron-expire-requests.yml` GitHub
  Action, which reads it from the repo secret of the same name. Optional in the
  schema because local dev never runs them, but **required on the Vercel production
  project and in GitHub Actions secrets**: without it Vercel sends no `Authorization`
  header, every cron route answers 503, and each run is reported as a failed job.
- `LOGIN_EMAIL_LIMIT_PER_15_MIN` / `LOGIN_IP_LIMIT_PER_MINUTE` /
  `LOGIN_GLOBAL_LIMIT_PER_10_SECONDS` - Optional overrides for the three login
  limiters (defaults 15, 120, 500)
- `RATE_LIMIT_IN_DEV` - Set to `1` to exercise the rate limiters locally
- `LOG_LEVEL`, `PERF_TIMING` / `NEXT_PUBLIC_PERF_TIMING` - Logging verbosity and the
  Server-Timing instrumentation used by `npm run measure:auth:web`
- `RESEND_FROM_EMAIL` / `DEMO_RECIPIENT_EMAIL` - Sender address and demo-request inbox
- `RESEND_API_KEY` - Transactional email (invites, password resets)
- `EXPO_ACCESS_TOKEN` - Expo push notifications
- `STRIPE_SECRET_KEY` - Stripe billing
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature verification
- `STRIPE_PRICE_ID_MONTHLY` - Monthly subscription price ID
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` - Error monitoring
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe client-side
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` - Analytics
- `NEXT_PUBLIC_SITE_URL` - Used by CSRF origin validation and absolute URL generation
- `NEXT_PUBLIC_BASE_DOMAIN` - Multi-tenant subdomain routing
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Maps
- `NEXT_PUBLIC_VERCEL_URL` - Fallback for CSRF origin in Vercel Preview deployments
- `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` - Declared in the server schema as optional; nothing in the app reads them today

**Scripts only (never read by the app):**

- `DATABASE_URL` / `SUPABASE_DB_PASSWORD` - direct Postgres access for `seed.ts`, `db:reset:remote`, `db:reset:staging`, `db:seed:branch`, and the migration inspectors (`scripts/lib/db-client.ts`); `SUPABASE_ACCESS_TOKEN` enables the Management API fallback transport
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `EXPO_PUBLIC_API_BASE_URL` - the mobile app's bundled (public) configuration in `apps/mobile/.env.local`

> Note: `SUPABASE_JWT_SECRET` is **not** used. JWT verification uses the JWKS
> endpoint (ES256 asymmetric keys from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`).

---

## Rotation Procedures

### SUPABASE_SECRET_KEY

1. Go to Supabase Dashboard > Settings > API Keys
2. Create a new secret (`sb_secret_...`) key and revoke the old one; the publishable/secret keys are individually revocable, unlike the legacy `anon`/`service_role` JWTs
3. Update in Vercel env vars (Production + Preview)
4. Run `vercel env pull` to update `.env.local` locally
5. Restart the deployment
6. Verify: hit `/api/health` and confirm DB check passes

### NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

1. Same location as above: rotate the publishable (`sb_publishable_...`) key
2. Update in Vercel env vars (all environments)
3. Run `vercel env pull` to update `.env.local` locally
4. Rebuild and deploy (the anon key is baked into the client bundle)
5. Verify: log in as a normal user, confirm schedule loads

### RESEND_API_KEY

1. Go to Resend Dashboard > API Keys
2. Create a new key with the same permissions
3. Update in Vercel env vars
4. Delete the old key in Resend
5. Verify: trigger a test invitation email

### UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

1. Go to Upstash Console > your database
2. If rotating the token: create a new token, update env vars, delete the old token
3. If rotating the URL: create a new database, migrate data, update URL
4. Verify: trigger rate limiting (5+ rapid login attempts to the same endpoint)

> Important: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are
> **required** in production. The rate limiters fail closed (503) when Redis is
> unconfigured — the app will return 503 on all rate-limited routes until these
> vars are set. See `apps/web/src/lib/rate-limit.ts`.

### CRON_SECRET

1. Generate a new value: `openssl rand -hex 32`
2. Update `CRON_SECRET` in the Vercel project env vars (Production scope)
3. Redeploy — Vercel reads the variable when it invokes a cron, so the next
   scheduled run picks up the new value
4. Update the `CRON_SECRET` repo secret under GitHub Settings → Secrets and variables → Actions, which the hourly `cron-expire-requests.yml` workflow sends
5. Verify: run the workflow with `workflow_dispatch` and confirm it logs HTTP 200; Vercel Dashboard > Cron Jobs shows the next `trial-expiry` / `sandbox-cleanup` run

> Important: this secret is generated by us, not by a third party, so there is
> nothing to revoke upstream. If it is missing entirely, the two crons in
> `apps/web/vercel.json` and the GitHub Action all get 503 and every run is reported
> as a failure.

### STRIPE_SECRET_KEY

1. Go to Stripe Dashboard > Developers > API Keys
2. Roll the secret key (Stripe supports rolling — new key active immediately, old key valid for 24 hours)
3. Update in Vercel env vars
4. Verify: check billing portal loads, webhook deliveries succeed

### STRIPE_WEBHOOK_SECRET

1. Go to Stripe Dashboard > Developers > Webhooks
2. Roll the webhook signing secret
3. Update in Vercel env vars
4. Verify: trigger a test webhook event from the Stripe dashboard

### SENTRY_AUTH_TOKEN

Used only at build time to upload source maps. Not needed at runtime.

1. Go to Sentry > Settings > Auth Tokens
2. Create a new token with the same scopes
3. Update in Vercel env vars and GitHub Actions secrets
4. Delete the old token
5. Verify: run a build and confirm source maps upload in the Sentry dashboard

### TURBO_TOKEN / TURBO_TEAM

Used for Turborepo remote cache.

1. In Vercel, create or rotate the Turbo access token for the team that owns the remote cache
2. Update GitHub Actions secrets: `TURBO_TOKEN` and `TURBO_TEAM`
3. Update local shell or secret manager values used for Turbo commands
4. Verify: run `npm run type-check` twice and confirm the second run reports cache hits

### NEXT_PUBLIC_POSTHOG_KEY / POSTHOG_PERSONAL_API_KEY

1. Go to PostHog > Project Settings > API Keys
2. Regenerate the key
3. Update in Vercel env vars
4. Verify: check PostHog dashboard shows events after deploy

---

## Rotation Schedule

| Quarter  | Secrets to Rotate               |
| -------- | ------------------------------- |
| Q1 (Jan) | Supabase keys, Resend API key   |
| Q2 (Apr) | Stripe keys, Upstash tokens     |
| Q3 (Jul) | Sentry token, PostHog keys      |
| Q4 (Oct) | All keys (annual full rotation) |

---

## Emergency Rotation

If a secret is compromised:

1. Rotate immediately using the procedure above
2. Check audit logs for unauthorized access (Supabase logs, Vercel function logs, Sentry events)
3. Notify the team
4. Document the incident

### What to check per secret

| Secret                     | Check                                                   |
| -------------------------- | ------------------------------------------------------- |
| `SUPABASE_SECRET_KEY`      | Supabase audit logs for unexpected service-role queries |
| `STRIPE_SECRET_KEY`        | Stripe Dashboard > Logs for unexpected API calls        |
| `STRIPE_WEBHOOK_SECRET`    | Stripe webhook delivery logs for signature failures     |
| `RESEND_API_KEY`           | Resend logs for unexpected email sends                  |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash logs for unexpected key reads/writes            |

---

## Security Notes

- Server-only secrets must never have the `NEXT_PUBLIC_` prefix. The server schema
  (`apps/web/src/lib/env.server.ts`) is a separate module from the public one so the
  names of server variables are never bundled into client chunks.
- In strict production mode the schema throws at startup for missing required vars,
  preventing a misconfigured deployment from silently failing open.
- Rotate secrets immediately if they are ever committed to version control. Use
  `git filter-repo` to purge history and rotate all secrets simultaneously (assume
  the commit was pushed before it was caught).
- Keep separate secret values per environment (dev / staging / production). Never
  copy a production secret to a development environment.
