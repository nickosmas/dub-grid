import { NextResponse, type NextRequest } from "next/server";
import { mobileOrgStatusResponseSchema } from "@dubgrid/contracts";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import {
  fetchMobileOrganizationMembershipRows,
  fetchMobileOrganizationRowById,
} from "@dubgrid/data-access";
import { extractMobileBearerToken } from "@dubgrid/mobile-api-core";
import { rowToOrganization } from "@/lib/db/mappers";
import { getServiceClient } from "@/lib/supabase-service";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import { isSessionRevoked } from "@/lib/auth/revocation";

export const dynamic = "force-dynamic";

// Deliberately bypasses requireMobileAuth/resolveMobileAuthContext — that
// path throws a 403 with only a canned message the moment an org is locked,
// before any billing detail reaches the client. This route does the same
// minimal identity + membership lookup but always returns the billing state
// instead of short-circuiting, so OrganizationLockedScreen can show real
// detail (trial grace end date, role-appropriate next step).
export async function GET(req: NextRequest) {
  const accessToken = extractMobileBearerToken(req.headers.get("authorization"));
  if (!accessToken) {
    return NextResponse.json(
      { error: "Your session expired. Sign in again to continue." },
      { status: 401 },
    );
  }

  // Verified locally against Supabase's JWKS, with an explicit revocation
  // check — no round trip to Supabase Auth. Unlike resolveMobileAuthContext
  // this route has no MFA-factor check to make, so nothing here needs the
  // full user record.
  const verified = await verifyAccessToken(accessToken);
  if (!verified || (await isSessionRevoked(verified))) {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again." },
      { status: 401 },
    );
  }

  const serviceClient = getServiceClient();
  const membershipRows = await fetchMobileOrganizationMembershipRows(
    serviceClient,
    verified.userId,
  );
  if (membershipRows.length === 0) {
    return NextResponse.json({ error: "No active organization membership found" }, { status: 403 });
  }

  const claimOrgId =
    typeof verified.claims.org_id === "string" && verified.claims.org_id
      ? verified.claims.org_id
      : null;
  const currentOrgId = claimOrgId ?? membershipRows[0]!.organization.id;
  const currentMembership =
    membershipRows.find((membership) => membership.organization.id === currentOrgId) ??
    membershipRows[0]!;

  const orgRow = await fetchMobileOrganizationRowById(serviceClient, currentOrgId);
  if (!orgRow) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  const org = rowToOrganization(orgRow);

  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: org.suspendedAt,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
  });

  const orgRole = currentMembership.org_role ?? "user";

  return NextResponse.json(
    mobileOrgStatusResponseSchema.parse({
      state: billingAccess.state,
      isLocked: billingAccess.isLocked,
      trialGraceEndsAt: billingAccess.trialGraceEndsAt,
      orgRole: orgRole === "super_admin" || orgRole === "admin" ? orgRole : "user",
    }),
  );
}
