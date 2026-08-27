# Authentication resilience operations

## Sentry dashboard

Create a dashboard named **Authentication and Organization bootstrap** in the
production Sentry project. Add these widgets:

- P95 transaction duration for `POST /api/auth/login` and
  `GET /api/organization/bootstrap` (five-minute window).
- Error-event count for `organization bootstrap GET failed`, grouped by
  `orgId`; this is diagnostic metadata only, never a user identifier or token.
- Message-event count for `Login load shed`, grouped by release and Vercel
  region.
- 429 response count for `/api/auth/login`, split by `Retry-After` value.

## Alerts

Configure the following production-only alerts. Route each to the on-call
channel and create an incident only when the condition remains true for two
consecutive windows.

| Signal                 | Threshold                   | Window     | Response                                                                  |
| ---------------------- | --------------------------- | ---------- | ------------------------------------------------------------------------- |
| Bootstrap failures     | 10 error events             | 5 minutes  | Check Supabase, Upstash, and the bootstrap endpoint timing.               |
| Authentication latency | P95 exceeds 5 seconds       | 10 minutes | Check Supabase Auth and post-login fan-out timings.                       |
| Bootstrap latency      | P95 exceeds 8 seconds       | 10 minutes | Check Redis cache hit rate and Supabase query latency.                    |
| Login load shedding    | 25 `Login load shed` events | 5 minutes  | Confirm surge traffic; adjust capacity only after checking abuse signals. |
| Sustained shedding     | 100 login 429s              | 10 minutes | Page on-call; review global/IP limiter values and dependency health.      |

Do not alert on individual invalid-credential or authorization failures: those
are expected user outcomes, not service incidents.

## Vercel build-cache warning

Turborepo must cache Next.js deploy output but exclude `.next/cache/**`. The
root `turbo.json` uses this exact exclusion. If a deployment still reports a
remote-cache 413, inspect the deployment's Turborepo Run Summary for the task
artifact size, then redeploy once without the build cache. Do not leave
`TURBO_FORCE` or `VERCEL_FORCE_NO_BUILD_CACHE` enabled permanently; they are
incident-only bypasses and remove the build-cache benefit.

## Staging acceptance

Run `npm run test:load:auth` against staging at the planned 1,000 sign-ins per
minute. Confirm successful sign-ins continue, excess load receives 429 with
`Retry-After`, bootstrap remains responsive, and the dashboard/alerts above
receive the expected test events.
