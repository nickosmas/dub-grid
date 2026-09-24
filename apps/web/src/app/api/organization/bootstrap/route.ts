import { NextRequest, NextResponse } from "next/server";
import { Timer, withTiming } from "@/lib/server-timing";
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
import { CacheKey, cacheThrough, TTL } from "@/lib/cache";
import { withTimeoutOrThrow } from "@/lib/with-timeout";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";

// The bootstrap fan-out is the authenticated shell's only blocking request.
// Four and a half seconds was short enough for a cold WebKit/Firefox navigation
// to turn a still-progressing database read into a 500, leaving the user at the
// recovery screen even though the organization was available. Keep a firm bound
// (so a genuinely stalled dependency still recovers) while allowing one normal
// slow browser navigation to finish.
const BOOTSTRAP_DEADLINE_MS = 10_000;

function timeBootstrapStage<T>(
  timer: Timer,
  deadlineAt: number,
  name: string,
  work: () => PromiseLike<T>,
): Promise<T> {
  const remainingMs = Math.max(1, deadlineAt - Date.now());
  return timer.time(name, () =>
    withTimeoutOrThrow(Promise.resolve(work()), remainingMs, `organization bootstrap ${name}`),
  );
}

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
      typeof claims.session_id === "string" ? claims.session_id : "",
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

  if (error) throw error;

  return { orgId: (data?.id as string | undefined) ?? null, isGridmaster: false };
}

async function handleGET(req: NextRequest, timer: Timer) {
  let orgId: string | null = null;
  let userId: string | null = null;
  const deadlineAt = Date.now() + BOOTSTRAP_DEADLINE_MS;

  try {
    const auth = await timeBootstrapStage(timer, deadlineAt, "auth", () =>
      requireAuthenticatedUserWithClaims(req),
    );
    if ("response" in auth) {
      return auth.response;
    }

    userId = auth.user?.id ?? null;

    const resolvedOrganization = await timeBootstrapStage(timer, deadlineAt, "resolve_org", () =>
      resolveOrganizationId(req, auth.claims, auth.user?.id ?? null),
    );
    orgId = resolvedOrganization.orgId;
    const { isGridmaster } = resolvedOrganization;

    if (isGridmaster && !orgId) {
      return NextResponse.json({
        org: null,
        isGridmaster: true,
        entryGate: {
          onboardingCompleted: false,
          adminOnboardingCompleted: false,
          billingLocked: null,
        },
        activeEmployeeCount: 0,
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
    const authorizedOrgId = orgId;

    const orgAuth = await timeBootstrapStage(timer, deadlineAt, "permissions", () =>
      requireOrgPermissions(req, authorizedOrgId, () => true, {
        allowLockedOrganization: true,
        allowDuringSetup: true,
        // Already verified at the top of this handler; without this the same
        // token costs two /auth/v1/user round trips on a route every page loads.
        actor: auth.user,
      }),
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const serviceClient = orgAuth.serviceClient;
    const [configResults, employeeCountResult, onboardingResult, adminOnboardingResult] =
      await timeBootstrapStage(timer, deadlineAt, "fanout", () =>
        Promise.all([
          // Authorization above is deliberately outside this cache. The cached
          // value is configuration for one org only; user, membership,
          // permissions, session, impersonation, sandbox selection, and staff
          // count remain request-scoped.
          timeBootstrapStage(timer, deadlineAt, "config", () =>
            cacheThrough(CacheKey.bootstrapConfig(orgAuth.orgId), TTL.MIDDLEWARE, () =>
              Promise.all([
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
              ]),
            ),
          ),
          // Count only — SetupGuard needs to know an org has staff before it
          // paints, and joining that question to this fan-out means first paint
          // no longer waits on the full roster fetch behind it.
          timeBootstrapStage(timer, deadlineAt, "employee_count", () =>
            serviceClient
              .from("employees")
              .select("id", { count: "exact", head: true })
              .eq("org_id", orgId)
              .eq("status", "active"),
          ),
          timeBootstrapStage(timer, deadlineAt, "entry_gate", () =>
            serviceClient
              .from("organization_memberships")
              .select("onboarding_completed_at")
              .eq("user_id", auth.user.id)
              .eq("org_id", orgAuth.orgId)
              .maybeSingle(),
          ),
          // Whether the organization is open to anyone else yet. A member who
          // cannot configure the org waits until a super admin has been all the
          // way through their own onboarding, not merely until the org's
          // configuration counts as complete: an org can read as configured
          // while its first super admin is still sitting on their welcome step.
          // Deliberately outside the cached config slice, so the wait ends on
          // the next fetch rather than up to a TTL later.
          timeBootstrapStage(timer, deadlineAt, "admin_entry_gate", () =>
            serviceClient
              .from("organization_memberships")
              .select("user_id", { count: "exact", head: true })
              .eq("org_id", orgAuth.orgId)
              .eq("org_role", "super_admin")
              .is("archived_at", null)
              .not("onboarding_completed_at", "is", null),
          ),
        ]),
      );

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
    ] = configResults;

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
    if (onboardingResult.error) throw onboardingResult.error;

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
    const billingLocked = orgAuth.permissions.isSuperAdmin
      ? evaluateOrganizationBillingAccess({
          suspendedAt: org.suspendedAt,
          subscriptionStatus: org.subscriptionStatus,
          trialEndsAt: org.trialEndsAt,
        }).isLocked
      : null;

    return NextResponse.json({
      org,
      isGridmaster: false,
      entryGate: {
        onboardingCompleted: Boolean(onboardingResult.data?.onboarding_completed_at),
        adminOnboardingCompleted: (adminOnboardingResult.count ?? 0) > 0,
        billingLocked,
      },
      activeEmployeeCount: employeeCountResult.count ?? 0,
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
    // `err` is Pino's structured-error field. Logging under `error` drops the
    // stack and provider details in production, making a client-visible
    // bootstrap failure impossible to diagnose from the log drain.
    logger.error({ err: error, orgId, userId }, "organization bootstrap GET failed");
    return NextResponse.json(
      { error: "We couldn't load your organization. Refresh and try again." },
      { status: 500 },
    );
  }
}

export const GET = withTiming(handleGET);
