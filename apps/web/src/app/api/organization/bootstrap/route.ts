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

function parseIncludeAssignments(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("includeAssignments") !== "0";
}

async function resolveOrganizationId(req: NextRequest, claims: Record<string, unknown>): Promise<{
  orgId: string | null;
  isGridmaster: boolean;
}> {
  const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
  const impersonation = impersonationCookie
    ? getImpersonationFromCookie(
        `${IMPERSONATION_COOKIE_NAME}=${impersonationCookie}`,
      )
    : null;

  if (impersonation?.targetOrgId) {
    return { orgId: impersonation.targetOrgId, isGridmaster: false };
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

    const includeAssignments = parseIncludeAssignments(req);
    const { orgId, isGridmaster } = await resolveOrganizationId(req, auth.claims);

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
      allowLockedWorkspace: true,
      allowDuringSetup: true,
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
      serviceClient
        .from("organizations")
        .select(ORGANIZATION_COLS)
        .eq("id", orgId)
        .single(),
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
      serviceClient
        .from("coverage_requirements")
        .select(COVERAGE_REQ_COLS)
        .eq("org_id", orgId),
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
    const shiftCategories = ((shiftCategoryResult.data ?? []) as DbShiftCategory[]).map(rowToShiftCategory);
    const jobs = ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition);
    const indicatorTypes = ((indicatorTypeResult.data ?? []) as DbIndicatorType[]).map(rowToIndicatorType);
    const certifications = ((certificationResult.data ?? []) as DbNamedItem[]).map(rowToNamedItem);
    const orgRoles = ((orgRoleResult.data ?? []) as DbNamedItem[]).map(rowToNamedItem);
    const departments = ((departmentResult.data ?? []) as DbDepartment[]).map(rowToDepartment);
    const coverageRequirements = ((coverageReqResult.data ?? []) as DbCoverageRequirement[]).map(rowToCoverageRequirement);
    const allAbsenceTypes = ((absenceTypeResult.data ?? []) as DbAbsenceType[]).map(rowToAbsenceType);
    const allAssignmentDefinitions = includeAssignments
      ? buildScheduleAssignmentOptions({
          orgId,
          focusAreas,
          shiftCategories,
          jobs,
          includeArchived: true,
        })
      : [];

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
    console.error("organization bootstrap GET failed", error);
    return NextResponse.json(
      { error: "Failed to load organization bootstrap" },
      { status: 500 },
    );
  }
}
