import { NextResponse, type NextRequest } from "next/server";
import {
  MOBILE_LOGIN_SERVER_DEADLINE_MS,
  mobileAuthLoginBodySchema,
  mobileAuthLoginResponseSchema,
} from "@dubgrid/contracts";
import {
  createMobileEphemeralAuthClient,
  isValidMobileOrgSlug,
  loginMobileUser,
  MobileApiRequestError,
  normalizeMobileOrgSlug,
} from "@dubgrid/mobile-api-core";
import { checkRateLimit, loginIpLimiter, loginLimiter, loginSurgeLimiter } from "@/lib/rate-limit";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { getServiceClient } from "@/lib/supabase-service";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { createMobileOptionsHandler, withMobileCors } from "./cors";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase-keys";
import { API_ERRORS } from "@dubgrid/client-errors";
import { withTiming, type Timer } from "@/lib/server-timing";
import { writeSecurityAuditEvent } from "@/lib/auth/security-audit";
import { sessionHashOf } from "@/lib/auth/sign-in-completion";
import { endUserSession } from "@/lib/auth/revocation";
import { verifyAccessToken } from "@/lib/auth/verify-token";

async function hashIdentifier(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(value.toLowerCase()));

  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export const dynamic = "force-dynamic";
const CORS_METHODS = ["POST", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

/**
 * The phone stops waiting after MOBILE_REQUEST_TIMEOUT_MS, but the server keeps
 * going and still creates a session (18.6 s observed under load), which then
 * lists as a signed-in device nobody used (F-78). Past the deadline, or once
 * the client has actually disconnected, the session is ended instead of
 * returned: answering with tokens nobody is waiting for is what leaves the
 * orphan.
 */
function clientHasGoneAway(req: NextRequest, startedAt: number): boolean {
  return req.signal?.aborted === true || Date.now() - startedAt >= MOBILE_LOGIN_SERVER_DEADLINE_MS;
}

/** Best effort: a login already too slow to use must not also fail on cleanup. */
async function discardSession(accessToken: string): Promise<boolean> {
  try {
    const verified = await verifyAccessToken(accessToken);
    if (!verified?.sessionId) return false;
    await endUserSession(verified.userId, verified.sessionId);
    return true;
  } catch {
    return false;
  }
}

async function handlePOST(req: NextRequest, timer: Timer) {
  const startedAt = Date.now();
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "We couldn't read that sign-in request. Try again." }, { status: 400 });
  }

  const parsed = mobileAuthLoginBodySchema.safeParse(body);
  const normalizedOrgSlug = parsed.success ? normalizeMobileOrgSlug(parsed.data.orgSlug) : "";

  if (!parsed.success || !isValidMobileOrgSlug(normalizedOrgSlug, RESERVED_SUBDOMAINS)) {
    return json(
      { error: "Enter a valid organization slug, email, and password." },
      { status: 400 },
    );
  }

  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [emailHash, sourceHash] = await Promise.all([
    hashIdentifier(parsed.data.email),
    hashIdentifier(sourceIp),
  ]);
  const limits = await timer.time("rate_limit", () =>
    Promise.all([
      checkRateLimit(loginLimiter, `login:email:${emailHash}`),
      checkRateLimit(loginIpLimiter, `login:ip:${sourceIp}`),
      checkRateLimit(loginSurgeLimiter, "login:global"),
    ]),
  );

  if (limits.some((limit) => limit.misconfigured)) {
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "failed",
      reason: "service_unavailable",
      metadata: { targetHash: emailHash, sourceHash, surface: "mobile" },
    });
    return json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }

  const limited = limits.filter((limit) => limit.limited);
  if (limited.length > 0) {
    const retryAfter = Math.max(
      1,
      ...limited.map((limit) => (limit.reset ? Math.ceil((limit.reset - Date.now()) / 1000) : 60)),
    );
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "throttled",
      reason: "rate_limited",
      metadata: { targetHash: emailHash, sourceHash, surface: "mobile" },
    });
    return json(
      {
        error: "Too many sign-in attempts. Wait a few minutes and try again.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const serviceClient = getServiceClient();
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabasePublishableKey();
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Server misconfigured" }, { status: 500 });
  }

  const sessionClient = createMobileEphemeralAuthClient(supabaseUrl, anonKey);

  try {
    const payload = await timer.time("login_flow", () =>
      loginMobileUser(serviceClient, sessionClient, {
        ...parsed.data,
        orgSlug: normalizedOrgSlug,
      }),
    );

    if (clientHasGoneAway(req, startedAt)) {
      const discarded = await discardSession(payload.session.accessToken);
      await writeSecurityAuditEvent({
        event: "security.auth.login",
        outcome: "failed",
        reason: "service_unavailable",
        actorId: payload.user.id,
        orgId: payload.organization.id,
        metadata: {
          targetHash: emailHash,
          sourceHash,
          surface: "mobile",
          clientGone: true,
          sessionDiscarded: discarded,
        },
      });
      return json(
        { error: "That took too long. Check your connection and sign in again." },
        { status: 504 },
      );
    }

    // With a second factor enrolled the password step is only challenged;
    // /api/mobile/v1/auth/sign-in-complete records the success. A success
    // carries its session so no completion call records it again.
    const sessionHash = payload.mfaRequired ? null : sessionHashOf(payload.session.accessToken);
    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: payload.mfaRequired ? "challenged" : "succeeded",
      reason: payload.mfaRequired ? "second_factor_required" : "accepted",
      actorId: payload.user.id,
      orgId: payload.organization.id,
      metadata: {
        targetHash: emailHash,
        sourceHash,
        surface: "mobile",
        ...(sessionHash ? { sessionHash } : {}),
      },
    });

    return json(mobileAuthLoginResponseSchema.parse(payload));
  } catch (error) {
    if (error instanceof MobileApiRequestError) {
      await writeSecurityAuditEvent({
        event: "security.auth.login",
        outcome: error.status >= 500 ? "failed" : "rejected",
        reason: error.status >= 500 ? "service_unavailable" : "policy_denied",
        metadata: { targetHash: emailHash, sourceHash, surface: "mobile" },
      });
      return json(
        {
          error: formatClientErrorMessage(error, "We could not finish signing you in right now."),
          ...(error.code ? { code: error.code } : {}),
        },
        { status: error.status },
      );
    }

    await writeSecurityAuditEvent({
      event: "security.auth.login",
      outcome: "failed",
      reason: "service_unavailable",
      metadata: { targetHash: emailHash, sourceHash, surface: "mobile" },
    });
    return json({ error: "We could not finish signing you in right now." }, { status: 503 });
  }
}

export const POST = withTiming(handlePOST);
