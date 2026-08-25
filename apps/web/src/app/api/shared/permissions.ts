import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildPermissionContext } from "@dubgrid/authz";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getSandboxFromCookie, SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";
import { cacheGet, cacheSet, CacheKey, TTL } from "@/lib/cache";
import { API_ERRORS } from "@dubgrid/client-errors";

// True when the caller's employees row in the effective org has status='inactive'.
// Gridmaster + unlinked super_admin users have no employees row → returns false.
// Removed users would normally have status='removed', but the JWT hook refuses
// them at sign-in/refresh — they can't reach any authenticated endpoint.
export async function isCallerInactive(
  serviceClient: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from("employees")
    .select("status")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data?.status as string | null) === "inactive";
}

type PermissionContext = ReturnType<typeof buildPermissionContext>;

interface OrgPermissionOptions {
  allowLockedOrganization?: boolean;
  allowDuringSetup?: boolean;
  /**
   * Opt out of the sandbox-redirect that requireOrgPermissions normally
   * applies when the caller has an active sandbox cookie. Use this for
   * endpoints that legitimately need to operate on the user's non-sandbox
   * org while they're in sandbox mode — for example, the billing read
   * endpoint, which must show the source organization's real Stripe state.
   */
  ignoreSandbox?: boolean;
  /**
   * An already-verified caller, to skip re-verifying the same token.
   *
   * `getUser()` is a network round trip to Supabase Auth on every call — it
   * never reads from the cookie. A route that ran requireAuthenticatedUser /
   * requireAuthenticatedUserWithClaims and then calls this helper pays that
   * round trip twice for one request. Pass the user from the first call.
   *
   * Only ever pass a `User` that came out of one of those helpers in *this*
   * request. Anything else skips authentication entirely.
   */
  actor?: User;
}

export interface AuthorizedOrgRequest {
  actor: User;
  permissions: PermissionContext;
  serviceClient: ReturnType<typeof getServiceClient>;
  userClient: ReturnType<typeof createRequestSupabaseClient>;
  /**
   * The effective org id this request is authorized against. May differ
   * from the orgId argument the caller passed in: when the caller is in
   * sandbox mode, requireOrgPermissions redirects to the sandbox org id.
   *
   * Endpoints that perform org-scoped writes MUST use this field, not
   * the orgId from the request body. Otherwise, the permission check
   * validates against the sandbox while the actual mutation lands on
   * the real organization — exactly the data leak the redirect is meant
   * to prevent.
   */
  orgId: string;
}

function forbiddenResponse(message: string = API_ERRORS.FORBIDDEN) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function lockedOrganizationResponse() {
  return NextResponse.json(
    {
      error:
        "Organization unavailable. Your organization opens up once your administrator finishes setup.",
    },
    { status: 403 },
  );
}

/**
 * isOrganizationSetupComplete, but it stops re-running once an org has passed.
 *
 * The raw check is seven full table scans, and requireOrgPermissions runs it on
 * all but a handful of its call sites — including /api/billing, which loads on
 * every page. For a live org that is seven queries per request forever, to
 * re-confirm something that became true during onboarding and stays true.
 *
 * Only `true` is ever written. That asymmetry is the whole design:
 *
 * - incomplete -> complete is the transition a user is actively waiting on
 *   ("I finished setup, why is it still locked?"). Never caching `false` means
 *   the very next request after the last setup step sees the change, with no
 *   invalidation to wire up at ~25 config write sites and no way for one of
 *   them to be missed later.
 * - complete -> incomplete (an admin archives the last focus area) is bounded
 *   by the TTL instead. That direction is a UX gate rather than a security
 *   boundary, and re-locking a working org a few minutes late is the harmless
 *   half of the trade.
 */
/**
 * In-process memo in front of the Redis lookup, holding only `true`.
 *
 * Redis is a network round trip, and this check runs on every org-scoped API
 * request — so on a single page load it was paid once per request in the
 * fan-out, for an answer that changes at most a few times in an org's life.
 * Measured against a distant Upstash region it was the single largest cost in
 * the post-login fan-out, several hundred milliseconds where the underlying
 * queries total under ten.
 *
 * Only `true` is memoized, exactly mirroring what is cached in Redis and for
 * the same reason: incomplete -> complete is the transition a user is actively
 * waiting on, so an org mid-setup must keep re-checking. The window is well
 * inside the Redis TTL, so this shortens how long a `true` is trusted by
 * nothing — it only avoids re-asking across requests that arrive together.
 */
const SETUP_COMPLETE_MEMO_TTL_MS = 30_000;
const setupCompleteMemo = new Map<string, number>();

/** Test seam: clears the in-process setup-complete memo between cases. */
export function resetOrgSetupCompleteMemo(): void {
  setupCompleteMemo.clear();
}

async function isOrganizationSetupCompleteCached(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<boolean> {
  const memoizedUntil = setupCompleteMemo.get(orgId);
  if (memoizedUntil !== undefined && memoizedUntil > Date.now()) {
    return true;
  }

  const key = CacheKey.orgSetupComplete(orgId);
  if (await cacheGet<boolean>(key)) {
    setupCompleteMemo.set(orgId, Date.now() + SETUP_COMPLETE_MEMO_TTL_MS);
    return true;
  }

  const complete = await isOrganizationSetupComplete(serviceClient, orgId);
  if (complete) {
    await cacheSet(key, true, TTL.STABLE);
    setupCompleteMemo.set(orgId, Date.now() + SETUP_COMPLETE_MEMO_TTL_MS);
  }
  return complete;
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
    serviceClient.from("focus_areas").select("id, department_id, archived_at").eq("org_id", orgId),
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
    serviceClient.from("certifications").select("id, archived_at").eq("org_id", orgId),
    serviceClient.from("organization_roles").select("id, archived_at").eq("org_id", orgId),
    serviceClient.from("departments").select("id, type, archived_at").eq("org_id", orgId),
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
      .filter((department) => department.type === "scheduled" && !department.archived_at)
      .map((department) => department.id),
  );

  const focusAreas = (focusAreasResult.data ?? []) as {
    id: number;
    department_id: number | null;
    archived_at: string | null;
  }[];
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archived_at);
  const activeFocusAreaIds = new Set(activeFocusAreas.map((focusArea) => focusArea.id));
  const focusAreasPlaced =
    scheduledDepartmentIds.size > 0 &&
    activeFocusAreas.length > 0 &&
    activeFocusAreas.every(
      (focusArea) =>
        focusArea.department_id != null && scheduledDepartmentIds.has(focusArea.department_id),
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
      (shift) => shift.focus_area_id != null && activeFocusAreaIds.has(shift.focus_area_id),
    );

  const jobs = (jobsResult.data ?? []) as {
    assignment_mode: string | null;
    show_on_grid: boolean | null;
    focus_area_ids: number[] | null;
    department_ids: number[] | null;
    applicable_shift_ids: number[] | null;
    archived_at: string | null;
  }[];
  const visibleJobs = jobs.filter((job) => !job.archived_at && job.show_on_grid !== false);
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

/**
 * Standalone version of the sandbox-redirect logic that
 * requireOrgPermissions does internally. Use this in endpoints that
 * take orgId from the request body and need to ensure all downstream
 * reads/writes target the user's sandbox (not the body's orgId).
 *
 * Returns the effective org id — the sandbox id if the caller has a
 * valid active sandbox cookie and isn't a gridmaster, otherwise the
 * requestedOrgId unchanged.
 *
 * Mutates nothing. Caller is responsible for using the returned id.
 */
export async function resolveEffectiveOrgId(
  req: NextRequest,
  userId: string,
  requestedOrgId: string,
): Promise<string> {
  const sandboxCookieValue = req.cookies.get(SANDBOX_COOKIE_NAME)?.value;
  if (!sandboxCookieValue) return requestedOrgId;
  const sb = getSandboxFromCookie(`${SANDBOX_COOKIE_NAME}=${sandboxCookieValue}`);
  if (!sb || sb.userId !== userId || sb.sandboxOrgId === requestedOrgId) {
    return requestedOrgId;
  }
  const svc = getServiceClient();
  const { data: ownedSandbox } = await svc
    .from("organizations")
    .select("id")
    .eq("id", sb.sandboxOrgId)
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!ownedSandbox) return requestedOrgId;
  const { data: profile } = await svc
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.platform_role === "gridmaster") return requestedOrgId;
  return ownedSandbox.id as string;
}

export async function requireOrgPermissions(
  req: NextRequest,
  orgId: string,
  isAllowed: (permissions: PermissionContext) => boolean,
  options?: OrgPermissionOptions,
): Promise<AuthorizedOrgRequest | { response: NextResponse }> {
  const auth = options?.actor ? { user: options.actor } : await requireAuthenticatedUser(req);
  if ("response" in auth) {
    return { response: auth.response };
  }

  // `ignoreSandbox` exists so read-only endpoints (billing) can show the
  // real org's state while the caller is sandboxed. It must never be
  // combined with a mutating request — that would let a sandboxed caller
  // write to their real org. Fail loudly (programming error, not a runtime
  // condition) rather than silently allowing it if a future endpoint gets
  // this wrong.
  if (options?.ignoreSandbox && req.method !== "GET" && req.method !== "HEAD") {
    throw new Error(
      `requireOrgPermissions: ignoreSandbox must not be used with ${req.method} — it bypasses the sandbox redirect and would let a sandboxed caller mutate their real org.`,
    );
  }

  const serviceClient = getServiceClient();

  // ── Sandbox org-redirect ────────────────────────────────────────────
  // Many endpoints accept `orgId` from the client (URL/body/query), and
  // some client code derives that orgId from the unrefreshed JWT — which
  // still points at the user's real organization. Without this redirect, a
  // settings/save POST issued while the user is "inside" a sandbox would
  // mutate the real organization.
  //
  // When the user has an active sandbox cookie (verified server-side
  // here), route ALL org-scoped checks to their sandbox regardless of
  // the orgId argument. Gridmasters intentionally manage other orgs, so
  // we exempt them — their actions on non-sandbox orgs stay as-is.
  // Endpoints can also opt out via { ignoreSandbox: true } when they
  // legitimately need to operate on the real organization (e.g. billing).
  const sandboxCookieValue = options?.ignoreSandbox
    ? null
    : req.cookies.get(SANDBOX_COOKIE_NAME)?.value;
  if (sandboxCookieValue) {
    const sb = getSandboxFromCookie(`${SANDBOX_COOKIE_NAME}=${sandboxCookieValue}`);
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
  const [{ data: membership }, { data: profile }, { data: organization }, inactive] =
    await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", auth.user.id)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient.from("profiles").select("platform_role").eq("id", auth.user.id).maybeSingle(),
      serviceClient
        .from("organizations")
        .select("suspended_at, subscription_status, trial_ends_at")
        .eq("id", orgId)
        .maybeSingle(),
      isCallerInactive(serviceClient, auth.user.id, orgId),
    ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  if (!isGridmaster && !membership) {
    return { response: forbiddenResponse(API_ERRORS.NOT_ORG_MEMBER) };
  }

  const role = isGridmaster
    ? "gridmaster"
    : ((membership?.org_role as OrganizationRole | null) ?? "user");
  const isSuperAdmin = role === "super_admin";

  // Inactive employees keep their session but lose every manage capability —
  // mirrors the mobile API's resolveMobileAuthContext (packages/mobile-api-core).
  // Gridmaster/super_admin bypass, matching account/permissions/route.ts: those
  // tiers aren't meant to be sidelined by a stale/incidental employees.status row.
  const permissions = buildPermissionContext(
    role,
    orgId,
    (membership?.admin_permissions as AdminPermissions | null) ?? null,
    { isInactive: inactive && !isGridmaster && !isSuperAdmin },
  );

  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: organization?.suspended_at ?? null,
    subscriptionStatus: organization?.subscription_status ?? null,
    trialEndsAt: organization?.trial_ends_at ?? null,
  });
  if (billingAccess.isLocked && !options?.allowLockedOrganization && !permissions.isGridmaster) {
    return { response: lockedOrganizationResponse() };
  }

  if (!isAllowed(permissions)) {
    return { response: forbiddenResponse(API_ERRORS.INSUFFICIENT_PERMISSION) };
  }

  if (!options?.allowDuringSetup && !permissions.isGridmaster) {
    const setupComplete = await isOrganizationSetupCompleteCached(serviceClient, orgId);
    if (!setupComplete) {
      return { response: lockedOrganizationResponse() };
    }
  }

  return {
    actor: auth.user,
    permissions,
    serviceClient,
    userClient,
    orgId,
  };
}
