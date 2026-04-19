import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import {
  buildPermissionContext,
  type PermissionContext,
} from "@/features/permissions";
import { createMobileUserClient } from "./client";
import type { AdminPermissions, Organization, PlatformRole } from "@/types";
import { rowToOrganization } from "@/lib/db/mappers";

type Claims = {
  org_id?: string;
  org_role?: string;
  org_slug?: string;
  platform_role?: string;
};

export interface MobileAuthContext {
  accessToken: string;
  user: User;
  claims: Claims;
  currentOrg: Organization;
  permissions: PermissionContext;
  membership: {
    orgRole: string;
    adminPermissions: AdminPermissions | null;
  } | null;
  memberships: Array<{
    orgId: string;
    orgName: string;
    orgSlug: string | null;
    orgRole: string;
    platformRole: PlatformRole;
  }>;
  userClient: ReturnType<typeof createMobileUserClient>;
  serviceClient: ReturnType<typeof getServiceClient>;
}

type MembershipOrg = {
  id: string;
  name: string;
  slug: string | null;
};

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim() || null;
}

function getMembershipOrg(value: unknown): MembershipOrg | null {
  const org = Array.isArray(value) ? value[0] : value;
  if (!org || typeof org !== "object") {
    return null;
  }

  const record = org as {
    id?: unknown;
    name?: unknown;
    slug?: unknown;
  };

  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    slug: typeof record.slug === "string" ? record.slug : null,
  };
}

export async function requireMobileAuth(
  req: NextRequest,
): Promise<MobileAuthContext | { response: NextResponse }> {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return {
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }

  const serviceClient = getServiceClient();
  const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] =
    await Promise.all([
      serviceClient.auth.getUser(accessToken),
      serviceClient.auth.getClaims(accessToken),
    ]);

  if (userError || claimsError || !userData.user || !claimsData?.claims) {
    return {
      response: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    };
  }

  const user = userData.user;
  const claims = claimsData.claims as Claims;
  if (claims.platform_role === "gridmaster") {
    return {
      response: NextResponse.json(
        { error: "Gridmaster mobile access is not supported" },
        { status: 403 },
      ),
    };
  }

  const membershipsResult = await serviceClient
    .from("organization_memberships")
    .select(
      `
        user_id,
        org_role,
        admin_permissions,
        joined_at,
        updated_at,
        department_ids,
        dept_admin_ids,
        organizations!inner(id, name, slug)
      `,
    )
    .eq("user_id", user.id)
    .is("archived_at", null);

  if (membershipsResult.error || !membershipsResult.data?.length) {
    return {
      response: NextResponse.json(
        { error: "No active organization membership found" },
        { status: 403 },
      ),
    };
  }

  const currentOrgId =
    typeof claims.org_id === "string" && claims.org_id
      ? claims.org_id
      : (getMembershipOrg(membershipsResult.data[0]?.organizations)?.id ?? null);

  if (!currentOrgId) {
    return {
      response: NextResponse.json(
        { error: "Missing organization context" },
        { status: 403 },
      ),
    };
  }

  const currentMembershipRow = membershipsResult.data.find((row) => {
    return getMembershipOrg(row.organizations)?.id === currentOrgId;
  });

  if (!currentMembershipRow) {
    return {
      response: NextResponse.json(
        { error: "Organization context does not match this user" },
        { status: 403 },
      ),
    };
  }

  const currentOrgResult = await serviceClient
    .from("organizations")
    .select(
      "id, name, slug, address, address_line_1, address_line_2, address_city, address_state, address_postal_code, address_country, phone, employee_count, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, archived_at, suspended_at, suspended_reason, enforce_conflict_prevention, stripe_customer_id, subscription_status, trial_ends_at, subscription_seats, data_retention_days, feature_overrides, updated_at",
    )
    .eq("id", currentOrgId)
    .single();

  if (currentOrgResult.error || !currentOrgResult.data) {
    return {
      response: NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      ),
    };
  }

  const currentOrg = rowToOrganization(currentOrgResult.data);
  const profileResult = await serviceClient
    .from("profiles")
    .select("platform_role, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  const adminPermissions =
    (currentMembershipRow.admin_permissions as AdminPermissions | null) ?? null;
  const orgRole = (currentMembershipRow.org_role as string | null) ?? "user";
  const platformRole =
    (profileResult.data?.platform_role as PlatformRole | null) ?? "none";

  const permissions = buildPermissionContext(orgRole, currentOrg.id, adminPermissions);
  const memberships = membershipsResult.data.map((row) => {
    const org = getMembershipOrg(row.organizations);
    if (!org) {
      throw new Error("Invalid organization membership relation shape");
    }
    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug ?? null,
      orgRole: (row.org_role as string | null) ?? "user",
      platformRole,
    };
  });

  return {
    accessToken,
    user,
    claims,
    currentOrg,
    permissions,
    membership: {
      orgRole,
      adminPermissions,
    },
    memberships,
    userClient: createMobileUserClient(accessToken),
    serviceClient,
  };
}
