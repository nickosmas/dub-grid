import { NextRequest, NextResponse } from "next/server";
import type {
  DbAbsenceType,
  DbCoverageRequirement,
  DbDepartment,
  DbFocusArea,
  DbIndicatorType,
  DbJobDefinition,
  DbNamedItem,
  DbOrganization,
  DbShiftCategory,
} from "@dubgrid/db-types";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { getServiceClient } from "@/lib/supabase-service";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { parseHost } from "@/lib/subdomain";
import { getImpersonationFromCookie, IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation";
import { verifyImpersonationSession } from "@/lib/impersonation-server";
import { getSandboxFromCookie, SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import {
  rowToAbsenceType,
  rowToCoverageRequirement,
  rowToDepartment,
  rowToFocusArea,
  rowToIndicatorType,
  rowToJobDefinition,
  rowToNamedItem,
  rowToOrganization,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import {
  ABSENCE_TYPE_COLS,
  COVERAGE_REQ_COLS,
  DEPARTMENT_COLS,
  FOCUS_AREA_COLS,
  INDICATOR_TYPE_COLS,
  JOB_COLS,
  NAMED_ITEM_COLS,
  ORGANIZATION_COLS,
  ORG_ROLE_COLS,
  SHIFT_CATEGORY_COLS,
} from "@/lib/db/shared";
import logger from "@/lib/logger";

async function resolveOrganizationId(
  req: NextRequest,
  claims: Record<string, unknown>,
  userId: string | null,
): Promise<{
  orgId: string | null;
  isGridmaster: boolean;
}> {
  const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
  const impersonation = impersonationCookie
    ? getImpersonationFromCookie(`${IMPERSONATION_COOKIE_NAME}=${impersonationCookie}`)
    : null;

  // The cookie is client-writable — only a real (JWT-verified) gridmaster
  // gets to use it, and only when its sessionId matches a still-active
  // impersonation_sessions row owned by them. Use the row's target_org_id,
  // not the cookie's copy.
  if (impersonation?.targetOrgId && claims.platform_role === "gridmaster" && userId) {
    const verified = await verifyImpersonationSession(
      getServiceClient(),
      impersonation.sessionId,
      userId,
    );
    if (verified) {
      return { orgId: verified.targetOrgId, isGridmaster: false };
    }
  }

  // Sandbox mode: when the user has an active sandbox cookie matching their
  // auth id, treat the sandbox org as the bootstrap target.
  //
  // The ownership row is re-checked here rather than assumed. Middleware does
  // verify the cookie, but it never runs on this request — its matcher excludes
  // `api` — so the previous comment's claim that it had ("middleware already
  // verified... before this request landed") was not true for any caller. That
  // left an attacker-supplied Cookie header naming an arbitrary org id, with
  // only the downstream requireOrgPermissions membership check between it and a
  // full org bootstrap. This mirrors the same query api-auth.ts runs.
  const sandboxCookieValue = req.cookies.get(SANDBOX_COOKIE_NAME)?.value;
  const sandbox = sandboxCookieValue
    ? getSandboxFromCookie(`${SANDBOX_COOKIE_NAME}=${sandboxCookieValue}`)
    : null;
  if (sandbox && userId && sandbox.userId === userId) {
    const { data: ownedSandbox } = await getServiceClient()
      .from("organizations")
      .select("id")
      .eq("id", sandbox.sandboxOrgId)
      .eq("workspace_kind", "sandbox")
      .eq("sandbox_owner_user_id", userId)
      .is("archived_at", null)
      .maybeSingle();

    if (ownedSandbox) {
      return { orgId: ownedSandbox.id, isGridmaster: false };
    }
    // Not theirs (or gone): fall through to the real claims rather than
    // honouring the cookie.
  }

  if (claims.platform_role === "gridmaster") {
    return { orgId: null, isGridmaster: true };
  }

  if (typeof claims.org_id === "string" && claims.org_id.length > 0) {
    return { orgId: claims.org_id, isGridmaster: false };
  }

  const parsedHost = parseHost(req.headers.get("host") ?? "");
  if (!parsedHost.subdomain || parsedHost.subdomain === "gridmaster") {
    return { orgId: null, isGridmaster: false };
  }

  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id")
    .eq("slug", parsedHost.subdomain)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return { orgId: (data?.id as string | undefined) ?? null, isGridmaster: false };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    const { orgId, isGridmaster } = await resolveOrganizationId(
      req,
      auth.claims,
      auth.user?.id ?? null,
    );

    if (isGridmaster && !orgId) {
      return NextResponse.json({
        org: null,
        isGridmaster: true,
        focusAreas: [],
        allAssignmentDefinitions: [],
        allAbsenceTypes: [],
        shiftCategories: [],
        jobs: [],
        indicatorTypes: [],
        certifications: [],
        orgRoles: [],
        departments: [],
        coverageRequirements: [],
      });
    }

    if (!orgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgAuth = await requireOrgPermissions(req, orgId, () => true, {
      allowLockedOrganization: true,
      allowDuringSetup: true,
      // Already verified at the top of this handler; without this the same
      // token costs two /auth/v1/user round trips on a route every page loads.
      actor: auth.user,
    });
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const serviceClient = orgAuth.serviceClient;
    const [
      orgResult,
      focusAreaResult,
      shiftCategoryResult,
      jobResult,
      indicatorTypeResult,
      certificationResult,
      orgRoleResult,
      departmentResult,
      coverageReqResult,
      absenceTypeResult,
    ] = await Promise.all([
      serviceClient.from("organizations").select(ORGANIZATION_COLS).eq("id", orgId).single(),
      serviceClient
        .from("focus_areas")
        .select(FOCUS_AREA_COLS)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("shift_categories")
        .select(SHIFT_CATEGORY_COLS)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("jobs")
        .select(JOB_COLS)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("indicator_types")
        .select(INDICATOR_TYPE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("certifications")
        .select(NAMED_ITEM_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("organization_roles")
        .select(ORG_ROLE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      serviceClient
        .from("departments")
        .select(DEPARTMENT_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      serviceClient.from("coverage_requirements").select(COVERAGE_REQ_COLS).eq("org_id", orgId),
      serviceClient
        .from("absence_types")
        .select(ABSENCE_TYPE_COLS)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true }),
    ]);

    if (orgResult.error) throw orgResult.error;
    if (focusAreaResult.error) throw focusAreaResult.error;
    if (shiftCategoryResult.error) throw shiftCategoryResult.error;
    if (jobResult.error) throw jobResult.error;
    if (indicatorTypeResult.error) throw indicatorTypeResult.error;
    if (certificationResult.error) throw certificationResult.error;
    if (orgRoleResult.error) throw orgRoleResult.error;
    if (departmentResult.error) throw departmentResult.error;
    if (coverageReqResult.error) throw coverageReqResult.error;
    if (absenceTypeResult.error) throw absenceTypeResult.error;

    const org = rowToOrganization(orgResult.data as DbOrganization);
    const focusAreas = ((focusAreaResult.data ?? []) as DbFocusArea[]).map(rowToFocusArea);
    const shiftCategories = ((shiftCategoryResult.data ?? []) as DbShiftCategory[]).map(
      rowToShiftCategory,
    );
    const jobs = ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition);
    const indicatorTypes = ((indicatorTypeResult.data ?? []) as DbIndicatorType[]).map(
      rowToIndicatorType,
    );
    const certifications = ((certificationResult.data ?? []) as DbNamedItem[]).map(rowToNamedItem);
    const orgRoles = ((orgRoleResult.data ?? []) as DbNamedItem[]).map(rowToNamedItem);
    const departments = ((departmentResult.data ?? []) as DbDepartment[]).map(rowToDepartment);
    const coverageRequirements = ((coverageReqResult.data ?? []) as DbCoverageRequirement[]).map(
      rowToCoverageRequirement,
    );
    const allAbsenceTypes = ((absenceTypeResult.data ?? []) as DbAbsenceType[]).map(
      rowToAbsenceType,
    );
    // Always built. It is a pure derivation over focusAreas/shiftCategories/jobs
    // that this handler already has in hand, so the old `includeAssignments=0`
    // opt-out saved no queries — it only split the client cache in two.
    const allAssignmentDefinitions = buildScheduleAssignmentOptions({
      orgId,
      focusAreas,
      shiftCategories,
      jobs,
      includeArchived: true,
    });

    return NextResponse.json({
      org,
      isGridmaster: false,
      focusAreas,
      allAssignmentDefinitions,
      allAbsenceTypes,
      shiftCategories,
      jobs,
      indicatorTypes,
      certifications,
      orgRoles,
      departments,
      coverageRequirements,
    });
  } catch (error) {
    logger.error({ error }, "organization bootstrap GET failed");
    return NextResponse.json({ error: "Failed to load organization bootstrap" }, { status: 500 });
  }
}
