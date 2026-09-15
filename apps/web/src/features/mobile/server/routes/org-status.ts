import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { mobileOrgStatusResponseSchema } from "@dubgrid/contracts";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import {
  fetchMobileOrganizationMembershipRows,
  fetchMobileOrganizationRowById,
  fetchMobileProfilePlatformRole,
} from "@dubgrid/data-access";
import { extractMobileBearerToken } from "@dubgrid/mobile-api-core";
import { rowToOrganization } from "@/lib/db/mappers";
import { getServiceClient } from "@/lib/supabase-service";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import { isSessionRevoked } from "@/lib/auth/revocation";

export const dynamic = "force-dynamic";

// Deliberately bypasses requireMobileAuth/resolveMobileAuthContext — that
// path throws a 403 with only a canned message the moment an org is locked.
// This route does the same minimal identity + membership lookup but returns
// recovery detail only to roles that own billing or platform operations.
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
  const platformRole = await fetchMobileProfilePlatformRole(serviceClient, verified.userId);
  if (platformRole === "gridmaster") {
    return NextResponse.json(
      { error: "Gridmaster mobile access is not supported" },
      { status: 403 },
    );
  }

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
  if (!claimOrgId) {
    return NextResponse.json(
      { error: "Your session is not tied to an organization. Sign in again to pick one." },
      { status: 403 },
    );
  }

  const currentMembership = membershipRows.find(
    (membership) => membership.organization.id === claimOrgId,
  );
  if (!currentMembership) {
    return NextResponse.json(
      { error: "Organization context does not match this user" },
      { status: 403 },
    );
  }

  const orgRow = await fetchMobileOrganizationRowById(serviceClient, claimOrgId);
  if (!orgRow) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  const org = rowToOrganization(orgRow);
  if (org.archivedAt) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }

  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: org.suspendedAt,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
  });

  const orgRole = currentMembership.org_role ?? "user";
  const canViewAccessDetails = orgRole === "super_admin";
  const available =
    !billingAccess.isLocked && (billingAccess.state !== "trial_pending" || canViewAccessDetails);

  return NextResponse.json(
    mobileOrgStatusResponseSchema.parse({
      state: canViewAccessDetails ? billingAccess.state : available ? "active" : "unavailable",
      isLocked: billingAccess.isLocked,
      trialGraceEndsAt: canViewAccessDetails ? billingAccess.trialGraceEndsAt : null,
      orgRole: orgRole === "super_admin" || orgRole === "admin" ? orgRole : "user",
    }),
  );
}
