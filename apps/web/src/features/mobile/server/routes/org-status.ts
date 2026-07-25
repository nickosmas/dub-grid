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

  const serviceClient = getServiceClient();
  const { data: userData, error: userError } = await serviceClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const membershipRows = await fetchMobileOrganizationMembershipRows(
    serviceClient,
    userData.user.id,
  );
  if (membershipRows.length === 0) {
    return NextResponse.json({ error: "No active organization membership found" }, { status: 403 });
  }

  const { data: claimsData } = await serviceClient.auth.getClaims(accessToken);
  const claims = claimsData?.claims as { org_id?: unknown } | undefined;
  const claimOrgId = typeof claims?.org_id === "string" && claims.org_id ? claims.org_id : null;
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
