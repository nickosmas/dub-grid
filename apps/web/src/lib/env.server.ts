import { z } from "zod";

// Importing this module validates the client vars too, so a server entrypoint
// still fails fast on any misconfiguration — which is what the single module
// did before it was split.
import "./env";

/**
 * Server-only environment validation.
 *
 * Split out from ./env because that module is reachable from the browser:
 * lib/supabase.ts imports clientEnv, and lib/supabase.ts is the browser client
 * behind AuthProvider. Sharing one module meant this schema — every server
 * variable name, including SUPABASE_SECRET_KEY, CRON_SECRET and the Stripe
 * keys — was bundled into client chunks alongside it. No values were ever
 * exposed, since Next only inlines NEXT_PUBLIC_*, but shipping the names of
 * your secrets to the browser is pointless weight and an invitation to
 * reference one from a client component and only find out at runtime.
 *
 * The `typeof window` guard below is a runtime check; it never stopped the
 * bundler from including the schema. Only a separate module does that.
 */
const isStrictProductionEnv =
  process.env.NODE_ENV === "production" &&
  (process.env.VERCEL_ENV === "production" || process.env.STRICT_PROD_ENV_VALIDATION === "1");

const serverSchema = z
  .object({
    // Note: SUPABASE_JWT_SECRET is no longer required — JWT verification uses JWKS
    // (ES256 asymmetric keys fetched from Supabase's .well-known/jwks.json endpoint).
    SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is required"),
    // Shared secret for the scheduled jobs in vercel.json. Vercel only injects
    // `Authorization: Bearer $CRON_SECRET` when this var exists on the project,
    // so an unset value makes every cron run return 503 and get reported as a
    // failed job. Optional here because local dev never runs the crons.
    CRON_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EXPO_ACCESS_TOKEN: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID_MONTHLY: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    LOGIN_IP_LIMIT_PER_MINUTE: z.coerce.number().int().positive().optional(),
    LOGIN_GLOBAL_LIMIT_PER_10_SECONDS: z.coerce.number().int().positive().optional(),
    LOGIN_EMAIL_LIMIT_PER_15_MIN: z.coerce.number().int().positive().optional(),
    SENTRY_DSN: z.string().url().optional(),
    VERCEL_API_TOKEN: z.string().optional(),
    VERCEL_PROJECT_ID: z.string().optional(),
    VERCEL_TEAM_ID: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    DEMO_RECIPIENT_EMAIL: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
    RATE_LIMIT_IN_DEV: z.string().optional(),
    PERF_TIMING: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (!isStrictProductionEnv) return;

    if (!env.UPSTASH_REDIS_REST_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_URL is required in production",
        path: ["UPSTASH_REDIS_REST_URL"],
      });
    }

    if (!env.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_TOKEN is required in production",
        path: ["UPSTASH_REDIS_REST_TOKEN"],
      });
    }
  });

function validateServerEnv() {
  // Only validate server env in server context (not in browser)
  // Real browsers get null; jsdom under test does not. Returning null in test
  // meant server code under test saw no config, which is why call sites read
  // process.env directly instead of this object.
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "test") return null;

  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    if (isStrictProductionEnv) {
      console.error(
        "[env] Server environment validation failed:\n",
        result.error.flatten().fieldErrors,
      );
      throw new Error("Missing required server environment variables. Check logs for details.");
    }
    // Warn in dev so misconfigurations are noticed early
    console.warn(
      "[env] Server environment validation issues (non-fatal in dev):\n",
      result.error.flatten().fieldErrors,
    );
    return null;
  }
  return result.data;
}

type ServerEnv = z.infer<typeof serverSchema>;

let serverMemo: ServerEnv | null | undefined;

/** Lazy for the same reason as clientEnv: see the note in ./env. */
function resolveServerEnv(): ServerEnv | null {
  if (process.env.NODE_ENV === "test") return validateServerEnv();
  if (serverMemo === undefined) serverMemo = validateServerEnv();
  return serverMemo;
}

export const serverEnv = new Proxy({} as ServerEnv, {
  get: (_target, prop: string) => resolveServerEnv()?.[prop as keyof ServerEnv],
  has: (_target, prop: string) => {
    const resolved = resolveServerEnv();
    return resolved ? prop in resolved : false;
  },
}) as ServerEnv | null;
