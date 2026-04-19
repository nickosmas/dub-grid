# Secrets Rotation Runbook

Quarterly rotation schedule. Each secret has a specific rotation procedure.

## Rotation Procedures

### SUPABASE_SERVICE_ROLE_KEY
1. Go to Supabase Dashboard > Settings > API
2. Regenerate the service_role key
3. Update in Vercel env vars (Production + Preview)
4. Run `vercel env pull` to update `.env.local` locally
5. Restart the deployment
6. Verify: hit `/api/health` and confirm DB check passes

### NEXT_PUBLIC_SUPABASE_ANON_KEY
1. Same location as above — regenerate the anon key
2. Update in Vercel env vars (all environments)
3. Run `vercel env pull` to update `.env.local` locally
4. Rebuild and deploy (anon key is baked into client bundle)
5. Verify: log in as a normal user, confirm schedule loads

### RESEND_API_KEY
1. Go to Resend Dashboard > API Keys
2. Create a new key with the same permissions
3. Update in Vercel env vars
4. Delete the old key in Resend
5. Verify: trigger a test invitation email

### UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
1. Go to Upstash Console > your database
2. If rotating token: create a new token, update env vars, delete old token
3. If rotating URL: create a new database, migrate, update URL
4. Verify: trigger rate limiting (5+ rapid login attempts)

### STRIPE_SECRET_KEY
1. Go to Stripe Dashboard > Developers > API Keys
2. Roll the secret key (Stripe supports rolling — new key active immediately, old key valid for 24h)
3. Update in Vercel env vars
4. Verify: check billing portal loads, webhook deliveries succeed

### STRIPE_WEBHOOK_SECRET
1. Go to Stripe Dashboard > Developers > Webhooks
2. Roll the webhook signing secret
3. Update in Vercel env vars
4. Verify: trigger a test webhook event

### SENTRY_AUTH_TOKEN
1. Go to Sentry > Settings > Auth Tokens
2. Create a new token with the same scopes
3. Update in Vercel env vars
4. Delete the old token
5. Verify: run a build and confirm source maps upload

### TURBO_TOKEN / TURBO_TEAM
1. In Vercel, create or rotate the Turbo access token for the team that owns the remote cache
2. Update GitHub Actions secrets: `TURBO_TOKEN` and `TURBO_TEAM`
3. Update local shell or secret manager values used for Turbo commands
4. Verify: run `npm run type-check` twice and confirm the second run reports cache hits

### NEXT_PUBLIC_POSTHOG_KEY / POSTHOG_PERSONAL_API_KEY
1. Go to PostHog > Project Settings > API Keys
2. Regenerate the key
3. Update in Vercel env vars
4. Verify: check PostHog dashboard shows events after deploy

## Rotation Schedule

| Quarter | Secrets to Rotate |
|---------|------------------|
| Q1 (Jan) | Supabase keys, Resend API key |
| Q2 (Apr) | Stripe keys, Upstash tokens |
| Q3 (Jul) | Sentry token, PostHog keys |
| Q4 (Oct) | All keys (annual full rotation) |

## Emergency Rotation

If a secret is compromised:
1. Rotate immediately using the procedure above
2. Check audit logs for unauthorized access
3. Notify the team
4. Document the incident
