import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { z } from "zod";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  isAccountDisabledMessage,
} from "@dubgrid/domain";
import { checkRateLimit, loginIpLimiter, loginLimiter, loginSurgeLimiter } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import { createAnonClient, createTokenScopedClient } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";
import { deleteSandboxForUser } from "@/features/test-sandbox/server";
import type { User } from "@supabase/supabase-js";
import { parseHost } from "@/lib/subdomain";
import { fetchTermsAcceptanceStatus } from "@/features/account/server";
import { lookupOrgBySlug } from "@/lib/org-lookup";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { Timer } from "@/lib/server-timing";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase-keys";
import { POST_LOGIN_DESTINATION } from "@/lib/auth/integrity-contract";
import {
  writeSecurityAuditEvent,
  type SecurityEventOutcome,
  type SecurityEventReason,
} from "@/lib/auth/security-audit";
import { endUserSession } from "@/lib/auth/revocation";
import { hashSessionId } from "@/lib/auth/sign-in-completion";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
  | Refusal;

/** A sign-in refused after the password was accepted, and what to record. */
type Refusal = {
  ok: false;
  status: number;
  code: string;
  error: string;
  outcome: Extract<SecurityEventOutcome, "rejected" | "failed">;
  reason: SecurityEventReason;
  orgId: string | null;
};

/** Returned when the user cannot access the organization named by the host. */
const ORG_ACCESS_DENIED_CODE = "ORG_ACCESS_DENIED";
const ORG_SUSPENDED_CODE = "ORG_SUSPENDED";
const ORG_DELETED_CODE = "ORG_DELETED";
const GRIDMASTER_PORTAL_REQUIRED_CODE = "GRIDMASTER_PORTAL_REQUIRED";
const GRIDMASTER_PORTAL_REQUIRED_MESSAGE =
  "Gridmaster accounts must sign in through the Gridmaster Portal before impersonating an organization.";

async function isGridmasterAccount(
  userId: string,
  claims: ReturnType<typeof decodeJwt>,
): Promise<boolean> {
  if (claims.platform_role === "gridmaster") return true;
  // A present non-gridmaster claim came from the same access-token hook and is
  // already authoritative for this session. Avoid an extra profile lookup on
  // the normal organization-login path.
  if (typeof claims.platform_role === "string") return false;

  // A newly issued token can occasionally predate the custom access-token
  // hook. Check the authoritative profile so that stale claims cannot let a
  // Gridmaster enter an organization login flow before the token is refreshed.
  const { data } = await getServiceClient()
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .maybeSingle();
  return data?.platform_role === "gridmaster";
}

/**
 * Re-scope a newly-created session to the organization encoded in the request
 * host. `switch_org` is the authorization boundary: it verifies that the
 * signed-in person has a live membership before the refreshed token is issued.
 */
async function switchSessionToHostOrganization(
  session: SessionTokens,
  hostSlug: string,
): Promise<{ ok: true; session: SessionTokens; claims: ReturnType<typeof decodeJwt> } | Refusal> {
  // Reuses the same 24h Redis-cached lookup app/login/page.tsx already ran for
  // this host moments earlier server-side, instead of a fresh DB round trip.
  const orgLookup = await lookupOrgBySlug(hostSlug);
  // A closed organization gets its own code so the sign-in page can say so;
  // switch_org would refuse it too, but only as a generic denial (F-87).
  if (orgLookup.status === "archived") {
    return {
      ok: false,
      status: 403,
      code: ORG_DELETED_CODE,
      error: "This organization has been deleted.",
      outcome: "rejected",
      reason: "organization_unavailable",
      orgId: null,
    };
  }
  // An outage is not a refusal: it is recorded as a failure, not as an
  // organization that does not exist.
  if (orgLookup.status === "error" || orgLookup.status === "unconfigured") {
    return {
      ok: false,
      status: 403,
      code: ORG_ACCESS_DENIED_CODE,
      error: "Your account is not associated with this organization.",
      outcome: "failed",
      reason: "service_unavailable",
      orgId: null,
    };
  }
  if (orgLookup.status !== "found") {
    return {
      ok: false,
      status: 403,
      code: ORG_ACCESS_DENIED_CODE,
      error: "Your account is not associated with this organization.",
      outcome: "rejected",
      reason: "organization_unavailable",
      orgId: null,
    };
  }
  if (orgLookup.org.suspendedAt) {
    return {
      ok: false,
      status: 403,
      code: ORG_SUSPENDED_CODE,
      error: "This organization is suspended.",
      outcome: "rejected",
      reason: "organization_unavailable",
      // Membership is unknown here, and an organization's log must not show
      // a sign-in by someone who is not its member.
      orgId: null,
    };
  }

  const client = createTokenScopedClient(session.access_token);
  const { error: switchError } = await client.rpc("switch_org", {
    target_org_id: orgLookup.org.id,
  });
  if (switchError) {
    return {
      ok: false,
      status: 403,
      code: ORG_ACCESS_DENIED_CODE,
      error: "Your account is not associated with this organization.",
      outcome: "rejected",
      reason: "organization_access_denied",
      // Not a member, so this organization's log must not carry the row.
      orgId: null,
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
      outcome: "failed",
      reason: "service_unavailable",
      orgId: orgLookup.org.id,
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
 * dashboard: host-selected organization context, trial activation, sandbox
 * teardown, and the terms check.
 *
 * All of it is server-side.
 * Only runs for the non-MFA path: MFA-required responses return before this
 * is called, so no trial-activation side effect can fire on a password check
 * alone before the second factor is verified.
 */
async function orchestratePostSignIn(
  initialSession: SessionTokens,
  claims: ReturnType<typeof decodeJwt>,
  req: NextRequest,
  isGridmaster: boolean,
): Promise<OrchestrationOutcome> {
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
        outcome: "failed",
        reason: "service_unavailable",
        orgId: null,
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
    // in. Non-fatal: never blocks sign-in on failure.
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
 * Records a sign-in refused after the password was accepted, and ends the Auth
 * session that password just created: its tokens never reach the browser, so
 * nothing else would end it. Ending it is best-effort and never changes the
 * response.
 */
async function refuseSignIn(input: {
  userId: string;
  sessionId: string | null;
  refusal: Pick<Refusal, "outcome" | "reason" | "orgId">;
  emailHash: string;
}): Promise<void> {
  await writeSecurityAuditEvent({
    event: "security.auth.login",
    outcome: input.refusal.outcome,
    reason: input.refusal.reason,
    actorId: input.userId,
    orgId: input.refusal.orgId,
    metadata: { targetHash: input.emailHash, surface: "web" },
  });
  if (!input.sessionId) return;
  try {
    await endUserSession(input.userId, input.sessionId);
  } catch (error) {
    logger.error({ error, userId: input.userId }, "Ending a refused sign-in's session failed");
  }
}

/**
 * POST /api/auth/login
 * Server-side login wrapper with brute-force protection. Also orchestrates
 * trial activation and the terms-check server-side for the non-MFA path so
 * the browser gets final tokens and a destination in one round trip.
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

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limits = await timer.time("ratelimit", () =>
    Promise.all([
      checkRateLimit(loginLimiter, `login:email:${emailHash}`),
      checkRateLimit(loginIpLimiter, `login:ip:${clientIp}`),
      checkRateLimit(loginSurgeLimiter, "login:global"),
    ]),
  );

  if (limits.some((limit) => limit.misconfigured)) {
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "failed",
      reason: "service_unavailable",
      metadata: { targetHash: emailHash, surface: "web" },
    });
    return NextResponse.json(
      { success: false, error: API_ERRORS.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }

  const limited = limits.filter((limit) => limit.limited);
  if (limited.length > 0) {
    const retryAfter = Math.max(1, ...limited.map((limit) => retryAfterSeconds(limit.reset)));
    logger.warn(
      { emailHash, path: "/api/auth/login", limitCount: limited.length },
      "Login rate limited",
    );
    Sentry.captureMessage("Login load shed", "warning");
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "throttled",
      reason: "rate_limited",
      metadata: { targetHash: emailHash, surface: "web" },
    });
    return NextResponse.json(
      {
        success: false,
        error: "Sign-in is busy right now. Please wait a moment and try again.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Authenticate via Supabase ─────────────────────────────────────
  const supabaseUrl = getSupabaseUrl();
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
      await writeSecurityAuditEvent({
        event: "security.auth.login",
        outcome: "failed",
        reason: "service_unavailable",
        metadata: { targetHash: emailHash, surface: "web" },
      });
      return NextResponse.json(
        { success: false, error: "DubGrid is unavailable right now. Try again in a moment." },
        { status: 503 },
      );
    }
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "rejected",
      reason: "invalid_credentials",
      metadata: { targetHash: emailHash, surface: "web" },
    });
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
  const claims = decodeJwt(session.access_token);
  const isGridmaster = await timer.time("gridmaster_login_intent", () =>
    isGridmasterAccount(data.user.id, claims),
  );
  const loginHost = parseHost(req.headers.get("host") ?? "").subdomain;

  // A Gridmaster's tenant access always starts from the platform portal and a
  // verified impersonation session. Reject this before the browser receives
  // tokens, including for MFA-enrolled accounts.
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : null;
  if (isGridmaster && loginHost !== "gridmaster") {
    await refuseSignIn({
      userId: data.user.id,
      sessionId,
      refusal: { outcome: "rejected", reason: "gridmaster_portal_required", orgId: null },
      emailHash,
    });
    const res = NextResponse.json(
      {
        success: false,
        code: GRIDMASTER_PORTAL_REQUIRED_CODE,
        error: GRIDMASTER_PORTAL_REQUIRED_MESSAGE,
      },
      { status: 403 },
    );
    timer.applyTo(res.headers);
    return res;
  }

  if (!mfaRequired && emailConfirmed) {
    const outcome = await timer.time("post_signin_orchestration", () =>
      orchestratePostSignIn(session, claims, req, isGridmaster),
    );
    if (!outcome.ok) {
      await refuseSignIn({ userId: data.user.id, sessionId, refusal: outcome, emailHash });
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
  if (didSwitchOrg) {
    res.cookies.set(SANDBOX_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  }
  timer.applyTo(res.headers);
  // A password alone is not a sign-in when a second factor is enrolled or the
  // email is unconfirmed: that step is challenged, and only a completed sign-in
  // records a success. A completed sign-in names the organization the session
  // ended in, after any switch. A challenge happens before the switch, so it
  // names the session's organization only when that is the one the host asked
  // for; otherwise the person may not be a member, and no organization's log
  // should carry it.
  const challenge: SecurityEventReason | null = !emailConfirmed
    ? "email_unconfirmed"
    : mfaRequired
      ? "second_factor_required"
      : null;
  const signedInClaims = didSwitchOrg ? decodeJwt(session.access_token) : claims;
  const sessionOrgId = typeof signedInClaims.org_id === "string" ? signedInClaims.org_id : null;
  await writeSecurityAuditEvent({
    event: "security.auth.login",
    outcome: challenge ? "challenged" : "succeeded",
    reason: challenge ?? "accepted",
    actorId: data.user.id,
    orgId: !challenge || !loginHost || claims.org_slug === loginHost ? sessionOrgId : null,
    // A completed sign-in carries its session, so the completion endpoint
    // never records the same sign-in a second time.
    metadata: {
      targetHash: emailHash,
      surface: "web",
      ...(!challenge && sessionId ? { sessionHash: hashSessionId(sessionId) } : {}),
    },
  });
  return res;
}
