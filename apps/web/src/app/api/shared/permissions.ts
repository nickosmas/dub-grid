import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildPermissionContext } from "@dubgrid/authz";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import type { AdminPermissions, OrganizationRole } from "@/types";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import {
  getSandboxFromCookie,
  SANDBOX_COOKIE_NAME,
} from "@/lib/sandbox-cookie";

type PermissionContext = ReturnType<typeof buildPermissionContext>;

interface OrgPermissionOptions {
  allowLockedWorkspace?: boolean;
  allowDuringSetup?: boolean;
  /**
   * Opt out of the sandbox-redirect that requireOrgPermissions normally
   * applies when the caller has an active sandbox cookie. Use this for
   * endpoints that legitimately need to operate on the user's non-sandbox
   * org while they're in sandbox mode — for example, the billing read
   * endpoint, which must show the source workspace's real Stripe state.
   */
  ignoreSandbox?: boolean;
}

export interface AuthorizedOrgRequest {
  actor: User;
  permissions: PermissionContext;
  serviceClient: ReturnType<typeof getServiceClient>;
  userClient: ReturnType<typeof createRequestSupabaseClient>;
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Insufficient permissions" },
    { status: 403 },
  );
}

function lockedWorkspaceResponse() {
  return NextResponse.json(
    {
      error:
        "Workspace unavailable. Your workspace will be available once your organization administrator finishes setup.",
    },
    { status: 403 },
  );
}

async function isOrganizationSetupComplete(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<boolean> {
  const [
    focusAreasResult,
    shiftCategoriesResult,
    jobsResult,
    certificationsResult,
    orgRolesResult,
    departmentsResult,
    employeesResult,
  ] = await Promise.all([
    serviceClient
      .from("focus_areas")
      .select("id, department_id, archived_at")
      .eq("org_id", orgId),
    serviceClient
      .from("shift_categories")
      .select("id, focus_area_id, archived_at")
      .eq("org_id", orgId),
    serviceClient
      .from("jobs")
      .select(
        "id, assignment_mode, show_on_grid, focus_area_ids, department_ids, applicable_shift_ids, archived_at",
      )
      .eq("org_id", orgId),
    serviceClient
      .from("certifications")
      .select("id, archived_at")
      .eq("org_id", orgId),
    serviceClient
      .from("organization_roles")
      .select("id, archived_at")
      .eq("org_id", orgId),
    serviceClient
      .from("departments")
      .select("id, type, archived_at")
      .eq("org_id", orgId),
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("archived_at", null),
  ]);

  const results = [
    focusAreasResult,
    shiftCategoriesResult,
    jobsResult,
    certificationsResult,
    orgRolesResult,
    departmentsResult,
    employeesResult,
  ];
  const error = results.find((result) => result.error)?.error;
  if (error) {
    throw error;
  }

  const departments = (departmentsResult.data ?? []) as {
    id: number;
    type: string | null;
    archived_at: string | null;
  }[];
  const scheduledDepartmentIds = new Set(
    departments
      .filter(
        (department) =>
          department.type === "scheduled" && !department.archived_at,
      )
      .map((department) => department.id),
  );

  const focusAreas = (focusAreasResult.data ?? []) as {
    id: number;
    department_id: number | null;
    archived_at: string | null;
  }[];
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archived_at);
  const activeFocusAreaIds = new Set(
    activeFocusAreas.map((focusArea) => focusArea.id),
  );
  const focusAreasPlaced =
    scheduledDepartmentIds.size > 0 &&
    activeFocusAreas.length > 0 &&
    activeFocusAreas.every(
      (focusArea) =>
        focusArea.department_id != null &&
        scheduledDepartmentIds.has(focusArea.department_id),
    );

  const shiftCategories = (shiftCategoriesResult.data ?? []) as {
    id: number;
    focus_area_id: number | null;
    archived_at: string | null;
  }[];
  const activeShifts = shiftCategories.filter((shift) => !shift.archived_at);
  const shiftsPlaced =
    activeShifts.length > 0 &&
    activeShifts.every(
      (shift) =>
        shift.focus_area_id != null &&
        activeFocusAreaIds.has(shift.focus_area_id),
    );

  const jobs = (jobsResult.data ?? []) as {
    assignment_mode: string | null;
    show_on_grid: boolean | null;
    focus_area_ids: number[] | null;
    department_ids: number[] | null;
    applicable_shift_ids: number[] | null;
    archived_at: string | null;
  }[];
  const visibleJobs = jobs.filter(
    (job) => !job.archived_at && job.show_on_grid !== false,
  );
  const jobsPlaced =
    visibleJobs.length > 0 &&
    visibleJobs.every((job) => {
      if (job.assignment_mode === "shiftless") {
        return true;
      }
      const hasDepartmentPlacement = (job.department_ids ?? []).some((id) =>
        scheduledDepartmentIds.has(id),
      );
      const hasFocusAreaPlacement = (job.focus_area_ids ?? []).some((id) =>
        activeFocusAreaIds.has(id),
      );
      const shiftIds = job.applicable_shift_ids ?? [];
      const shiftsAreInScope =
        shiftIds.length > 0 &&
        shiftIds.every((id) => activeShifts.some((shift) => shift.id === id));

      return (hasDepartmentPlacement || hasFocusAreaPlacement) && shiftsAreInScope;
    });

  const certifications = (certificationsResult.data ?? []) as {
    archived_at: string | null;
  }[];
  const orgRoles = (orgRolesResult.data ?? []) as {
    archived_at: string | null;
  }[];

  return (
    focusAreasPlaced &&
    shiftsPlaced &&
    jobsPlaced &&
    certifications.some((certification) => !certification.archived_at) &&
    orgRoles.some((orgRole) => !orgRole.archived_at) &&
    (employeesResult.count ?? 0) > 0
  );
}

export async function requireOrgPermissions(
  req: NextRequest,
  orgId: string,
  isAllowed: (permissions: PermissionContext) => boolean,
  options?: OrgPermissionOptions,
): Promise<AuthorizedOrgRequest | { response: NextResponse }> {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) {
    return { response: auth.response };
  }

  const serviceClient = getServiceClient();

  // ── Sandbox org-redirect ────────────────────────────────────────────
  // Many endpoints accept `orgId` from the client (URL/body/query), and
  // some client code derives that orgId from the unrefreshed JWT — which
  // still points at the user's real workspace. Without this redirect, a
  // settings/save POST issued while the user is "inside" a sandbox would
  // mutate the real workspace.
  //
  // When the user has an active sandbox cookie (verified server-side
  // here), route ALL org-scoped checks to their sandbox regardless of
  // the orgId argument. Gridmasters intentionally manage other orgs, so
  // we exempt them — their actions on non-sandbox orgs stay as-is.
  // Endpoints can also opt out via { ignoreSandbox: true } when they
  // legitimately need to operate on the real workspace (e.g. billing).
  const sandboxCookieValue = options?.ignoreSandbox
    ? null
    : req.cookies.get(SANDBOX_COOKIE_NAME)?.value;
  if (sandboxCookieValue) {
    const sb = getSandboxFromCookie(
      `${SANDBOX_COOKIE_NAME}=${sandboxCookieValue}`,
    );
    if (sb && sb.userId === auth.user.id && sb.sandboxOrgId !== orgId) {
      const { data: ownedSandbox } = await serviceClient
        .from("organizations")
        .select("id")
        .eq("id", sb.sandboxOrgId)
        .eq("workspace_kind", "sandbox")
        .eq("sandbox_owner_user_id", auth.user.id)
        .is("archived_at", null)
        .maybeSingle();
      if (ownedSandbox) {
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("platform_role")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (profile?.platform_role !== "gridmaster") {
          orgId = ownedSandbox.id;
        }
      }
    }
  }

  const userClient = createRequestSupabaseClient(req);
  const [{ data: membership }, { data: profile }, { data: organization }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", auth.user.id)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
    serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", auth.user.id)
      .maybeSingle(),
    serviceClient
      .from("organizations")
      .select("suspended_at, subscription_status, trial_ends_at")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  if (!isGridmaster && !membership) {
    return { response: forbiddenResponse() };
  }

  const role = isGridmaster
    ? "gridmaster"
    : ((membership?.org_role as OrganizationRole | null) ?? "user");
  const permissions = buildPermissionContext(
    role,
    orgId,
    (membership?.admin_permissions as AdminPermissions | null) ?? null,
  );

  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: organization?.suspended_at ?? null,
    subscriptionStatus: organization?.subscription_status ?? null,
    trialEndsAt: organization?.trial_ends_at ?? null,
  });
  if (
    billingAccess.isLocked &&
    !options?.allowLockedWorkspace &&
    !permissions.isGridmaster
  ) {
    return { response: lockedWorkspaceResponse() };
  }

  if (!isAllowed(permissions)) {
    return { response: forbiddenResponse() };
  }

  if (!options?.allowDuringSetup && !permissions.isGridmaster) {
    const setupComplete = await isOrganizationSetupComplete(serviceClient, orgId);
    if (!setupComplete) {
      return { response: lockedWorkspaceResponse() };
    }
  }

  return {
    actor: auth.user,
    permissions,
    serviceClient,
    userClient,
  };
}
