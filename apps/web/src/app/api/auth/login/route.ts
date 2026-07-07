import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { z } from "zod";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  isAccountDisabledMessage,
} from "@dubgrid/domain";
import { loginLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { createAnonClient, createTokenScopedClient } from "@/lib/api-auth";
import { parseHost } from "@/lib/subdomain";
import { fetchTermsAcceptanceStatus } from "@/features/account/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { Timer } from "@/lib/server-timing";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const POST_LOGIN_DESTINATION = "/dashboard";

interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

type OrchestrationOutcome =
  | { ok: true; session: SessionTokens; destination: string | null; needsClientOrgSwitch: boolean }
  | { ok: false; status: number; code: string; error: string };

/**
 * Resolves trial activation and terms status server-side, right after
 * signInWithPassword, for the common case (JWT's org already matches the
 * subdomain, or the caller is gridmaster) — collapsing what used to be
 * separate start-trial/terms round trips into this one request.
 *
 * Deliberately does NOT also collapse org-switching (get_my_organizations →
 * switch_org → refreshSession) into this request: that was evaluated and
 * reverted (see memory: project_login_double_mint_constraint /
 * feedback_validate_before_navigate) as not worth the regression risk in
 * this historically fragile area. When the JWT's org doesn't match the
 * subdomain, this returns `needsClientOrgSwitch: true` and the client drives
 * that sequence itself, same as before this consolidation existed.
 *
 * Only runs for the non-MFA path: MFA-required responses return before this
 * is called, so no trial-activation side effect can fire on a password
 * check alone before the second factor is verified.
 */
async function orchestratePostSignIn(
  initialSession: SessionTokens,
  claims: ReturnType<typeof decodeJwt>,
  req: NextRequest,
): Promise<OrchestrationOutcome> {
  const isGridmaster = claims.platform_role === "gridmaster";
  let session = initialSession;
  // Kicked off (not awaited) inside the non-gridmaster branch below when
  // applicable, then run concurrently with the terms-check — neither
  // depends on the other's result, and both are already best-effort.
  let trialPromise: Promise<unknown> = Promise.resolve();

  if (isGridmaster) {
    // Always refresh once so custom_access_token_hook has a chance to bake
    // platform_role=gridmaster into the new JWT before we navigate.
    const client = createTokenScopedClient(session.access_token);
    const { data, error } = await client.auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    if (error || !data.session) {
      return {
        ok: false,
        status: 401,
        code: "SESSION_REFRESH_FAILED",
        error: "Your session could not be verified. Please sign in again.",
      };
    }
    session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    };
  } else {
    const hostSlug = parseHost(req.headers.get("host") ?? "").subdomain;
    const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;

    if (hostSlug && userSlug !== hostSlug) {
      return { ok: true, session, destination: null, needsClientOrgSwitch: true };
    }

    // First super_admin login starts this org's trial. Idempotent and
    // self-gated server-side, so safe to fire whenever a super_admin signs
    // in. Non-fatal: never blocks sign-in on failure.
    const signedInOrgId = typeof claims.org_id === "string" ? claims.org_id : null;
    if (signedInOrgId && claims.org_role === "super_admin") {
      trialPromise = (async () => {
        try {
          await createTokenScopedClient(session.access_token).rpc("start_trial_for_org", {
            p_org_id: signedInOrgId,
          });
        } catch {
          // Non-fatal: never block sign-in on trial activation.
        }
      })();
    }
  }

  let destination = POST_LOGIN_DESTINATION;
  const [, termsResult] = await Promise.allSettled([
    trialPromise,
    fetchTermsAcceptanceStatus(claims.sub as string),
  ]);
  // Best-effort: a rejection here means the user lands on the destination
  // without a ToS check this turn. They'll be re-checked next sign-in.
  if (termsResult.status === "fulfilled" && !termsResult.value.acceptedCurrentTerms) {
    destination = `/accept-terms?next=${encodeURIComponent(POST_LOGIN_DESTINATION)}`;
  }

  return { ok: true, session, destination, needsClientOrgSwitch: false };
}

/**
 * POST /api/auth/login
 * Server-side login wrapper with brute-force protection. Also orchestrates
 * trial activation and the terms-check server-side for the non-MFA,
 * non-org-switch path (see orchestratePostSignIn) so the browser gets final
 * tokens and a destination in one round trip instead of driving that
 * sequence itself. Org-switching stays client-orchestrated (see
 * orchestratePostSignIn's doc comment).
 * Rate-limits by SHA-256 hash of email (never stores raw email in Redis).
 */
export async function POST(req: NextRequest) {
  const timer = new Timer();
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Input validation ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: API_ERRORS.INVALID_BODY },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.INVALID_INPUT },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  // ── Rate limit by hashed email ────────────────────────────────────
  // Hash the email so we never store raw PII in Redis
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(email.toLowerCase()));
  const emailHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { limited, reset, misconfigured } = await timer.time("ratelimit", () =>
    checkRateLimit(loginLimiter, `login:${emailHash}`),
  );

  if (misconfigured) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 900;
    logger.warn({ emailHash, path: "/api/auth/login" }, "Login rate limited");
    return NextResponse.json(
      {
        success: false,
        error: "Too many login attempts. Please try again later.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Authenticate via Supabase ─────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    logger.error("Supabase env vars not configured for login route");
    Sentry.captureMessage("Supabase env vars not configured for login route", "error");
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const supabase = createAnonClient();

  const { data, error } = await timer.time("signin", () =>
    supabase.auth.signInWithPassword({ email, password }),
  );

  if (error) {
    logger.info({ emailHash, path: "/api/auth/login", errorMsg: error.message }, "Login failed");
    // The JWT hook refuses terminated employees with a sentinel message
    // (ACCOUNT_DISABLED_MESSAGE). Surface that as a structured 403 so the
    // login UI can show a friendly "account disabled" modal instead of the
    // generic invalid-credentials toast.
    if (isAccountDisabledMessage(error.message)) {
      return NextResponse.json(
        {
          success: false,
          code: ACCOUNT_DISABLED_CODE,
          error: ACCOUNT_DISABLED_MESSAGE,
        },
        { status: 403 },
      );
    }
    // A 5xx from GoTrue (e.g. the custom_access_token_hook or its DB
    // connection blipping) is an infra failure, not a rejected password —
    // telling the user their credentials are wrong here is actively
    // misleading. Only a genuine credential rejection (4xx) gets the
    // generic "Invalid email or password" (to avoid email enumeration).
    if (typeof error.status === "number" && error.status >= 500) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Check if user has verified TOTP factors (MFA enrolled)
  const verifiedTotpFactors = (data.user.factors ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  const mfaRequired = verifiedTotpFactors.length > 0;

  let session: SessionTokens = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
  };
  let destination: string | null = null;
  let needsClientOrgSwitch = false;

  // Email not yet confirmed: the client redirects to /verify-email without
  // ever calling setBrowserSession, so orchestration (which assumes a
  // fully-usable session) would be wasted work here.
  const emailConfirmed = !!data.user.email_confirmed_at;

  if (!mfaRequired && emailConfirmed) {
    const claims = decodeJwt(session.access_token);
    const outcome = await timer.time("post_signin_orchestration", () =>
      orchestratePostSignIn(session, claims, req),
    );
    if (!outcome.ok) {
      const res = NextResponse.json(
        { success: false, code: outcome.code, error: outcome.error },
        { status: outcome.status },
      );
      timer.applyTo(res.headers);
      return res;
    }
    session = outcome.session;
    destination = outcome.destination;
    needsClientOrgSwitch = outcome.needsClientOrgSwitch;
  }

  // Return the session tokens so the client can set them
  const res = NextResponse.json({
    success: true,
    session,
    user: {
      id: data.user.id,
      email: data.user.email,
      email_confirmed_at: data.user.email_confirmed_at,
    },
    mfa_required: mfaRequired,
    destination,
    needsClientOrgSwitch,
  });
  timer.applyTo(res.headers);
  return res;
}
