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
import { getServiceClient } from "@/lib/supabase-service";
import { SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";
import { deleteSandboxForUser } from "@/features/test-sandbox/server";
import type { User } from "@supabase/supabase-js";
import { parseHost } from "@/lib/subdomain";
import { fetchTermsAcceptanceStatus } from "@/features/account/server";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { Timer } from "@/lib/server-timing";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getSupabasePublishableKey } from "@/lib/supabase-keys";

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
  | {
      ok: true;
      session: SessionTokens;
      destination: string | null;
      /**
       * The session was re-scoped to a different organization during this
       * request. The client must drop its query cache and hard-navigate, and
       * the response must clear any sandbox cookie.
       */
      didSwitchOrg: boolean;
    }
  | { ok: false; status: number; code: string; error: string };

/** Returned to the client when the caller has no access to the subdomain's org. */
const ORG_ACCESS_DENIED_CODE = "ORG_ACCESS_DENIED";

/**
 * Re-scopes a just-minted session to the organization the caller is signing
 * in to, when that isn't the one their profile defaults to.
 *
 * The second token mint is unavoidable: `switch_org` writes
 * `user_sessions.active_org_id` keyed on a `session_id` that does not exist
 * until the first token is minted, and the access-token hook only picks the
 * new org up on the next mint. What this removes is the client having to
 * drive it — that was `get_my_organizations`, `switch_org`, the refresh, the
 * trial start, the sandbox teardown and the terms check as six serial HTTP
 * round trips before a full page load, measured at 4.4s against a
 * seven-organization account.
 *
 * `switch_org` is the authorization boundary here, not the slug lookup: the
 * RPC itself verifies the caller's membership and that the org is active, so
 * resolving the slug through the service client grants nothing on its own.
 */
async function switchSessionToHostOrganization(
  session: SessionTokens,
  hostSlug: string,
): Promise<
  | { ok: true; session: SessionTokens; claims: ReturnType<typeof decodeJwt> }
  | { ok: false; status: number; code: string; error: string }
> {
  const { data: org } = await getServiceClient()
    .from("organizations")
    .select("id")
    .eq("slug", hostSlug)
    .is("archived_at", null)
    .maybeSingle();

  if (!org?.id) {
    return {
      ok: false,
      status: 403,
      code: ORG_ACCESS_DENIED_CODE,
      error: "Your account is not associated with this organization.",
    };
  }

  const client = createTokenScopedClient(session.access_token);
  const { error: switchError } = await client.rpc("switch_org", { target_org_id: org.id });
  if (switchError) {
    // switch_org rejects a caller with no live membership, or an inactive
    // org. Both mean the same thing to the person signing in.
    return {
      ok: false,
      status: 403,
      code: ORG_ACCESS_DENIED_CODE,
      error: "Your account is not associated with this organization.",
    };
  }

  const { data, error } = await client.auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error || !data.session) {
    return {
      ok: false,
      status: 401,
      code: "SESSION_REFRESH_FAILED",
      error: "We couldn't verify your session. Sign in again.",
    };
  }

  const next: SessionTokens = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
  };
  return { ok: true, session: next, claims: decodeJwt(next.access_token) };
}

/**
 * Everything that has to happen between a correct password and a usable
 * dashboard: re-scoping the session to the organization being signed in to,
 * trial activation, sandbox teardown, and the terms check.
 *
 * All of it is server-side. Org-switching used to be driven from the browser
 * as six serial round trips before a full page load — measured at 4.4s on a
 * seven-organization account, against 1.4s for this. That split was
 * deliberate once (see memory: project_login_double_mint_constraint) and was
 * re-opened with explicit sign-off; the constraint it was protecting still
 * holds and is documented on switchSessionToHostOrganization, namely that the
 * second token mint is structural and cannot be removed, only relocated.
 *
 * Only runs for the non-MFA path: MFA-required responses return before this
 * is called, so no trial-activation side effect can fire on a password
 * check alone before the second factor is verified. That path still switches
 * organizations from the browser, because it cannot re-enter this route.
 */
async function orchestratePostSignIn(
  initialSession: SessionTokens,
  claims: ReturnType<typeof decodeJwt>,
  req: NextRequest,
): Promise<OrchestrationOutcome> {
  const isGridmaster = claims.platform_role === "gridmaster";
  let session = initialSession;
  let effectiveClaims = claims;
  let didSwitchOrg = false;
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
        error: "We couldn't verify your session. Sign in again.",
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
      const switched = await switchSessionToHostOrganization(session, hostSlug);
      if (!switched.ok) return switched;
      session = switched.session;
      effectiveClaims = switched.claims;
      didSwitchOrg = true;
    }

    // First super_admin login starts this org's trial. Idempotent and
    // self-gated server-side, so safe to fire whenever a super_admin signs
    // in. Non-fatal: never blocks sign-in on failure. Reads the post-switch
    // claims, so a switch starts the trial for the org actually signed in to.
    const signedInOrgId =
      typeof effectiveClaims.org_id === "string" ? effectiveClaims.org_id : null;
    if (signedInOrgId && effectiveClaims.org_role === "super_admin") {
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

  // A fresh login ends the previous session, so any sandbox left over from it
  // must not be resumed. The client used to await this after switching, because
  // its hard navigation aborted the request often enough that the sandbox
  // survived — and a surviving sandbox cookie pins every later request to a
  // clone of the org the user just left, at an elevated role. Done here there
  // is nothing to abort, so it runs alongside the other two best-effort steps.
  const sandboxTeardown: Promise<unknown> = didSwitchOrg
    ? (async () => {
        try {
          await deleteSandboxForUser({
            serviceClient: getServiceClient(),
            actor: { id: claims.sub as string } as User,
          });
        } catch {
          // Non-fatal: never block sign-in on sandbox teardown.
        }
      })()
    : Promise.resolve();

  let destination = POST_LOGIN_DESTINATION;
  const [, , termsResult] = await Promise.allSettled([
    trialPromise,
    sandboxTeardown,
    fetchTermsAcceptanceStatus(claims.sub as string),
  ]);
  // Best-effort: a rejection here means the user lands on the destination
  // without a ToS check this turn. They'll be re-checked next sign-in.
  if (termsResult.status === "fulfilled" && !termsResult.value.acceptedCurrentTerms) {
    destination = `/accept-terms?next=${encodeURIComponent(POST_LOGIN_DESTINATION)}`;
  }

  return { ok: true, session, destination, didSwitchOrg };
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
    return NextResponse.json({ success: false, error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: API_ERRORS.INVALID_INPUT }, { status: 400 });
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
      { success: false, error: API_ERRORS.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }

  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 900;
    logger.warn({ emailHash, path: "/api/auth/login" }, "Login rate limited");
    return NextResponse.json(
      {
        success: false,
        error: "Too many sign-in attempts. Wait a few minutes and try again.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Authenticate via Supabase ─────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = getSupabasePublishableKey();

  if (!supabaseUrl || !anonKey) {
    logger.error("Supabase env vars not configured for login route");
    Sentry.captureMessage("Supabase env vars not configured for login route", "error");
    return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 500 });
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
        { success: false, error: "DubGrid is unavailable right now. Try again in a moment." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Check your email and password and try again." },
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
  let didSwitchOrg = false;

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
    didSwitchOrg = outcome.didSwitchOrg;
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
    didSwitchOrg,
  });
  // The session now points at a different organization than any sandbox the
  // cookie names. Leaving it set would route every later request into a clone
  // of the org the user just left, at super_admin.
  if (didSwitchOrg) {
    res.cookies.set(SANDBOX_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  }
  timer.applyTo(res.headers);
  return res;
}
