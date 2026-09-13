import { NextRequest, NextResponse } from "next/server";
import {
  createSensitiveActionStepUpRequired,
  evaluateSensitiveActionAssurance,
  resolveVerifiedTotpFactorPresence,
} from "@dubgrid/authz";
import { API_ERRORS } from "@dubgrid/client-errors";
import type { Organization } from "@dubgrid/domain";
import {
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

async function resolveMobileRequestAuth(
  req: NextRequest,
  allowAal1ForStepUp: boolean,
): Promise<MobileAuthContext | { response: NextResponse }> {
  if (!(await isFeatureEnabled("mobile_api"))) {
    return {
      response: NextResponse.json(
        { error: "DubGrid is unavailable right now. Try again in a moment." },
        { status: 503 },
      ),
    };
  }

  const accessToken = extractMobileBearerToken(req.headers.get("authorization"));
  if (!accessToken) {
    return {
      response: NextResponse.json(
        { error: "Your session expired. Sign in again to continue." },
        { status: 401 },
      ),
    };
  }

  try {
    return await resolveMobileAuthContext({
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
      allowAal1ForStepUp,
    });
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
