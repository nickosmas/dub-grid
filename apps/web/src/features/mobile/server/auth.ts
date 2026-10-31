import { createHash } from "node:crypto";
import { getPlatformBillingPolicy } from "@/lib/billing-policy";
import { NextRequest, NextResponse } from "next/server";
import {
  createSensitiveActionStepUpRequired,
  evaluateSensitiveActionAssurance,
  resolveVerifiedTotpFactorPresence,
} from "@dubgrid/authz";
import { API_ERRORS } from "@dubgrid/client-errors";
import type { Organization } from "@dubgrid/domain";
import {
  fetchHiddenInternalUserIds,
  fetchMobileOrganizationMembershipRows,
  fetchMobileOrganizationRowById,
  fetchMobileProfilePlatformRole,
} from "@dubgrid/data-access";
import {
  extractMobileBearerToken,
  MobileApiRequestError,
  resolveMobileAuthContext,
  type MobileAuthClaims,
  type ResolvedMobileAuthContext,
} from "@dubgrid/mobile-api-core";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import { isSessionRevoked } from "@/lib/auth/revocation";
import { rowToOrganization } from "@/lib/db/mappers";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { getServiceClient } from "@/lib/supabase-service";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createMobileUserClient } from "./client";

export type MobileAuthContext = ResolvedMobileAuthContext<Organization>;

/**
 * A cold start fires several requests with one token at once, and each used to
 * resolve the same context: verification, the Auth `getUser`, and seven reads.
 * One resolution serves them all for a few seconds, the same window the
 * revocation check already allows itself, and only for that exact token.
 */
const AUTH_MEMO_MS = 5_000;
const AUTH_MEMO_MAX = 500;
const authMemo = new Map<string, { expiresAt: number; context: Promise<MobileAuthContext> }>();

/** Test seam: forgets every remembered context. */
export function resetMobileAuthMemoForTests(): void {
  authMemo.clear();
}

function rememberedContext(
  accessToken: string,
  allowAal1ForStepUp: boolean,
): Promise<MobileAuthContext> {
  const now = Date.now();
  const key = `${allowAal1ForStepUp ? 1 : 0}:${createHash("sha256").update(accessToken).digest("base64url")}`;
  const remembered = authMemo.get(key);
  if (remembered && remembered.expiresAt > now) return remembered.context;
  if (authMemo.size >= AUTH_MEMO_MAX) {
    for (const [staleKey, entry] of authMemo) {
      if (entry.expiresAt <= now) authMemo.delete(staleKey);
    }
    if (authMemo.size >= AUTH_MEMO_MAX) authMemo.clear();
  }
  const context = resolveTokenContext(accessToken, allowAal1ForStepUp);
  authMemo.set(key, { expiresAt: now + AUTH_MEMO_MS, context });
  // A refusal or an outage is answered once and asked again next time.
  context.catch(() => {
    if (authMemo.get(key)?.context === context) authMemo.delete(key);
  });
  return context;
}

function resolveTokenContext(
  accessToken: string,
  allowAal1ForStepUp: boolean,
): Promise<MobileAuthContext> {
  return resolveMobileAuthContext({
    accessToken,
    serviceClient: getServiceClient(),
    createUserClient: createMobileUserClient,
    fetchMemberships: fetchMobileOrganizationMembershipRows,
    fetchOrganization: fetchMobileOrganizationRowById,
    fetchPlatformRole: fetchMobileProfilePlatformRole,
    mapOrganization: rowToOrganization,
    // Claims come from local JWKS verification instead of a second call to
    // Supabase Auth (`getClaims`), and revocation is checked explicitly
    // because a locally verified token can't tell that it was signed out.
    verifyToken: async (accessToken) => {
      const verified = await verifyAccessToken(accessToken);
      if (!verified) return null;
      return {
        userId: verified.userId,
        sessionId: verified.sessionId,
        issuedAtMs: verified.issuedAtMs,
        claims: verified.claims as MobileAuthClaims,
      };
    },
    isRevoked: (token) => isSessionRevoked(token),
    loadPlatformBillingPolicy: () => getPlatformBillingPolicy(getServiceClient()),
    allowAal1ForStepUp,
  });
}

async function resolveMobileRequestAuth(
  req: NextRequest,
  allowAal1ForStepUp: boolean,
): Promise<MobileAuthContext | { response: NextResponse }> {
  const accessToken = extractMobileBearerToken(req.headers.get("authorization"));
  // Started together: the flag no longer holds up verification.
  const context = accessToken ? rememberedContext(accessToken, allowAal1ForStepUp) : null;
  context?.catch(() => {});

  if (!(await isFeatureEnabled("mobile_api"))) {
    return {
      response: NextResponse.json(
        { error: "DubGrid is unavailable right now. Try again in a moment." },
        { status: 503 },
      ),
    };
  }

  if (!context) {
    return {
      response: NextResponse.json(
        { error: "Your session expired. Sign in again to continue." },
        { status: 401 },
      ),
    };
  }

  try {
    return await context;
  } catch (error) {
    if (error instanceof MobileApiRequestError) {
      return {
        response: NextResponse.json(
          { error: formatClientErrorMessage(error, "We could not verify this session right now.") },
          { status: error.status },
        ),
      };
    }

    return {
      response: NextResponse.json(
        { error: "We could not verify this session right now." },
        { status: 503 },
      ),
    };
  }
}

/** The context for a token this server just minted, or null on any refusal. */
export async function resolveMobileAuthForToken(
  accessToken: string,
): Promise<MobileAuthContext | null> {
  return rememberedContext(accessToken, false).catch(() => null);
}

export function requireMobileAuth(
  req: NextRequest,
): Promise<MobileAuthContext | { response: NextResponse }> {
  return resolveMobileRequestAuth(req, false);
}

/** Only identity/step-up handlers may admit AAL1 while a verified factor exists. */
export function requireMobileStepUpSession(req: NextRequest) {
  return resolveMobileRequestAuth(req, true);
}

export async function requireMobileSensitiveActionAuth(
  req: NextRequest,
): Promise<MobileAuthContext | { response: NextResponse }> {
  const auth = await resolveMobileRequestAuth(req, true);
  if ("response" in auth) return auth;

  const hasVerifiedTotpFactor = resolveVerifiedTotpFactorPresence(auth.user.factors);
  if (hasVerifiedTotpFactor === null) {
    return {
      response: NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 }),
    };
  }

  const decision = evaluateSensitiveActionAssurance({
    claims: auth.claims,
    hasVerifiedTotpFactor,
  });
  if (!decision.allowed) {
    return {
      response: NextResponse.json(createSensitiveActionStepUpRequired(decision.requiredMethod), {
        status: 403,
      }),
    };
  }

  return auth;
}

/** The user ids this mobile viewer must not be shown: internal (QA) accounts, unless they may see them. */
export function fetchMobileHiddenPeople(auth: MobileAuthContext): Promise<string[]> {
  return fetchHiddenInternalUserIds(auth.serviceClient, {
    userId: auth.user.id,
    isGridmaster: auth.permissions.isGridmaster,
  });
}
