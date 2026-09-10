import type { MobileAuthLoginBody, MobileAuthLoginResponse } from "@dubgrid/contracts";
import { buildPermissionContext, type PermissionContext } from "@dubgrid/authz";
import type {
  BillingAccessResult,
  AdminPermissions,
  Organization,
  PlatformRole,
} from "@dubgrid/domain";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  evaluateOrganizationBillingAccess,
  isAccountDisabledMessage,
} from "@dubgrid/domain";
import { createClient, type Factor, type SupabaseClient, type User } from "@supabase/supabase-js";
import { findMobileOrganizationBySlug, type MobileOrganizationLookup } from "./organization";
import { isMobileOrgSetupComplete } from "./setup";

type OrgMembership = {
  org_id: string;
  org_name: string;
  org_slug: string | null;
  org_role?: string | null;
  is_active: boolean;
};

type SignedInSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export type MobileAuthClaims = {
  aal?: string;
  org_id?: string;
  org_role?: string;
  org_slug?: string;
  platform_role?: string;
  session_id?: string;
};

type MobileAuthMembershipRow = {
  user_id: string;
  org_role: string | null;
  admin_permissions: AdminPermissions | null;
  joined_at: string;
  updated_at: string | null;
  department_ids: number[];
  dept_admin_ids: number[];
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
};

export interface ResolvedMobileAuthContext<
  TOrganization extends Pick<Organization, "id"> = Organization,
> {
  accessToken: string;
  user: User;
  claims: MobileAuthClaims;
  currentOrg: TOrganization;
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
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
}

export class MobileApiRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "MobileApiRequestError";
    this.status = status;
    this.code = code;
  }
}

function getMobileUserName(user: User): {
  firstName: string | null;
  lastName: string | null;
} {
  return {
    firstName: (user.user_metadata?.first_name as string | undefined) ?? null,
    lastName: (user.user_metadata?.last_name as string | undefined) ?? null,
  };
}

function getLockedOrgMessage(orgRole: string, billingAccess: BillingAccessResult): string {
  if (orgRole === "super_admin") {
    if (billingAccess.reason === "suspended") {
      return "Organization unavailable. Contact DubGrid support for help.";
    }
    return "Organization unavailable. Sign in on the web to manage billing.";
  }

  return "Organization unavailable. Please try again later.";
}

function getIncompleteSetupMessage(orgRole: string): string {
  if (orgRole === "super_admin") {
    return "Organization unavailable. Sign in on the web to finish organization setup.";
  }

  return "Organization unavailable. Please try again later.";
}

async function requireMobileOrganization(
  serviceClient: SupabaseClient,
  slug: string,
): Promise<MobileOrganizationLookup> {
  try {
    const organization = await findMobileOrganizationBySlug(serviceClient, slug);
    if (!organization) {
      throw new MobileApiRequestError(404, "No organization matched that slug.");
    }

    return organization;
  } catch (error) {
    if (error instanceof MobileApiRequestError) {
      throw error;
    }

    throw new MobileApiRequestError(503, "We could not verify that organization right now.");
  }
}

async function signInMobileUser(
  authClient: SupabaseClient,
  input: MobileAuthLoginBody,
): Promise<{
  session: SignedInSession;
  user: User;
  mfaFactor: Factor<"totp", "verified"> | null;
}> {
  // Sign in on the per-request ephemeral client, never the shared service
  // client. signInWithPassword sets a session on whatever client it runs on,
  // which rewrites that client's PostgREST Authorization header to the user's
  // token. The service client is a process-wide singleton reused for
  // service-role reads/writes; signing in on it would silently downgrade every
  // later service-role query to the last-logged-in user's RLS scope.
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  // The JWT hook refuses removed employees with a sentinel message. Surface
  // it as a structured ACCOUNT_DISABLED error so the mobile UI can render a
  // friendly disabled-account message instead of a generic invalid-credentials
  // toast. The hook returns http_code 403; Supabase surfaces it on
  // authError.status / authError.message.
  if (authError && isAccountDisabledMessage(authError.message)) {
    throw new MobileApiRequestError(403, ACCOUNT_DISABLED_MESSAGE, ACCOUNT_DISABLED_CODE);
  }

  if (
    authError ||
    !authData.session ||
    !authData.user ||
    !authData.session.access_token ||
    !authData.session.refresh_token
  ) {
    throw new MobileApiRequestError(401, "Invalid email or password");
  }

  if (!authData.user.email_confirmed_at) {
    throw new MobileApiRequestError(403, "Verify your email on the web before using mobile.");
  }

  const verifiedTotpFactors = (authData.user.factors ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  ) as Factor<"totp", "verified">[];

  return {
    session: authData.session as SignedInSession,
    user: authData.user,
    mfaFactor: verifiedTotpFactors[0] ?? null,
  };
}

async function assertMobileProfileSupported(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new MobileApiRequestError(503, "We could not finish signing you in right now.");
  }

  if ((profile?.platform_role as string | null) === "gridmaster") {
    throw new MobileApiRequestError(
      403,
      "Gridmaster accounts are not supported in the mobile app.",
    );
  }
}

async function loadMobileMemberships(sessionClient: SupabaseClient): Promise<OrgMembership[]> {
  const membershipsResult = await sessionClient.rpc("get_my_organizations");

  if (membershipsResult.error) {
    throw new MobileApiRequestError(403, "We could not verify your organization access.");
  }

  return (membershipsResult.data ?? []) as OrgMembership[];
}

/**
 * The `org_id` this access token actually carries, or null if it carries none.
 *
 * Read locally rather than round-tripped: the caller has just been handed this
 * token by GoTrue, and the value is only used to decide whether a switch is
 * still needed. Every request it leads to is authorized server-side against the
 * same token, so a forged one gains nothing here.
 */
function readTokenOrgId(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims = JSON.parse(
      typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary"),
    ) as { org_id?: unknown };

    return typeof claims.org_id === "string" && claims.org_id.length > 0 ? claims.org_id : null;
  } catch {
    // Unreadable token → treat it as carrying no org, which makes the caller
    // switch. A redundant switch is harmless; a skipped one is the bug below.
    return null;
  }
}

async function switchMobileOrgIfNeeded(
  sessionClient: SupabaseClient,
  session: SignedInSession,
  membership: OrgMembership,
): Promise<SignedInSession> {
  // Decided from THIS token's own org_id, not from `membership.is_active`.
  //
  // `is_active` comes from get_my_organizations, which resolved it from the
  // user's global profile default. Another device switching orgs moved that
  // default, so this device could be told "you are already in org B" while the
  // token it just received still said org A — and this function would return
  // without switching or refreshing. The login response then reported org B
  // while every subsequent API call resolved org A from the claim: B's name and
  // branding over A's roster, schedule and permissions.
  //
  // The token is the only thing the API actually trusts, so it is the only
  // thing worth comparing. This stays correct against a database where
  // get_my_organizations has not been fixed yet.
  if (readTokenOrgId(session.access_token) === membership.org_id) {
    return session;
  }

  const switchResult = await sessionClient.rpc("switch_org", {
    target_org_id: membership.org_id,
  });

  if (switchResult.error) {
    throw new MobileApiRequestError(400, "We could not switch your organization right now.");
  }

  const refreshResult = await sessionClient.auth.refreshSession();
  if (refreshResult.error || !refreshResult.data.session) {
    throw new MobileApiRequestError(
      503,
      "We could not refresh your session after switching organizations.",
    );
  }

  return refreshResult.data.session as SignedInSession;
}

export function createMobileEphemeralAuthClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function extractMobileBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim() || null;
}

export async function resolveMobileAuthContext<
  TOrganizationRow,
  TOrganization extends Pick<
    Organization,
    "id" | "archivedAt" | "suspendedAt" | "subscriptionStatus" | "trialEndsAt"
  > = Organization,
>(input: {
  accessToken: string;
  serviceClient: SupabaseClient;
  createUserClient: (accessToken: string) => SupabaseClient;
  fetchMemberships: (
    serviceClient: SupabaseClient,
    userId: string,
  ) => Promise<MobileAuthMembershipRow[]>;
  fetchOrganization: (
    serviceClient: SupabaseClient,
    orgId: string,
  ) => Promise<TOrganizationRow | null>;
  fetchPlatformRole: (
    serviceClient: SupabaseClient,
    userId: string,
  ) => Promise<PlatformRole | null>;
  mapOrganization: (row: TOrganizationRow) => TOrganization;
  /**
   * Verifies the access token and returns its claims, without calling
   * Supabase Auth. Injected rather than imported so this package stays
   * platform-neutral; the web app supplies a JWKS-based local verifier.
   */
  verifyToken: (accessToken: string) => Promise<{
    userId: string;
    sessionId: string | null;
    /** Token issue time, epoch ms — needed for the revoke-all watermark. */
    issuedAtMs: number | null;
    claims: MobileAuthClaims;
  } | null>;
  /**
   * True when the token's session has been revoked (signed out, device
   * revoked, account deactivated). Local verification can't see that on its
   * own, so it has to be asked separately.
   */
  isRevoked: (input: {
    userId: string;
    sessionId: string | null;
    issuedAtMs: number | null;
  }) => Promise<boolean>;
}): Promise<ResolvedMobileAuthContext<TOrganization>> {
  const verified = await input.verifyToken(input.accessToken);
  if (!verified) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  const claims = verified.claims;

  if (
    await input.isRevoked({
      userId: verified.userId,
      sessionId: verified.sessionId,
      issuedAtMs: verified.issuedAtMs,
    })
  ) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  // The one call to Supabase Auth still on this path, and it is load-bearing.
  //
  // Without it a password-only (aal1) token would satisfy a user who has TOTP
  // enrolled, which is an MFA bypass. Enrolled factors live in `auth.mfa_factors`,
  // which PostgREST does not expose, and they are not carried in the JWT — so
  // there is no way to answer "does this user have a verified factor?" locally
  // today. `profiles.mfa_enabled` is NOT a substitute: the client writes it
  // after enrolling, so a client that skips that call leaves it false, and a
  // stale `false` is exactly the direction that reopens the bypass.
  const { data: userData, error: userError } = await input.serviceClient.auth.getUser(
    input.accessToken,
  );

  if (userError || !userData.user) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  const user = userData.user;
  const hasVerifiedTotpFactor = (user.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  if (hasVerifiedTotpFactor && claims.aal !== "aal2") {
    throw new MobileApiRequestError(401, "Two-factor authentication required");
  }

  const platformRole = (await input.fetchPlatformRole(input.serviceClient, user.id)) ?? "none";
  if (platformRole === "gridmaster") {
    throw new MobileApiRequestError(403, "Gridmaster mobile access is not supported");
  }

  const membershipRows = await input.fetchMemberships(input.serviceClient, user.id);
  if (membershipRows.length === 0) {
    throw new MobileApiRequestError(403, "No active organization membership found");
  }

  // The claim, or nothing. This used to fall back to `membershipRows[0]`, and
  // that query has no ORDER BY — so a token whose org claim the access-token
  // hook had stripped (its org archived or suspended, its membership revoked)
  // silently adopted an arbitrary one of the user's other organizations and
  // built the whole PermissionContext for it, which meant writes landed there
  // too. Refusing is the only safe reading of "this token names no org": the
  // client's answer is to switch deliberately, which re-mints the claim.
  const currentOrgId =
    typeof claims.org_id === "string" && claims.org_id.length > 0 ? claims.org_id : null;

  if (!currentOrgId) {
    throw new MobileApiRequestError(
      403,
      "Your session is not tied to an organization. Sign in again to pick one.",
    );
  }

  const currentMembership = membershipRows.find(
    (membership) => membership.organization.id === currentOrgId,
  );
  if (!currentMembership) {
    throw new MobileApiRequestError(403, "Organization context does not match this user");
  }

  const currentOrgRow = await input.fetchOrganization(input.serviceClient, currentOrgId);
  if (!currentOrgRow) {
    throw new MobileApiRequestError(404, "Organization not found");
  }

  const adminPermissions = currentMembership.admin_permissions ?? null;
  const orgRole = currentMembership.org_role ?? "user";
  const currentOrg = input.mapOrganization(currentOrgRow);
  if (currentOrg.archivedAt) {
    throw new MobileApiRequestError(403, "Organization unavailable. Please try again later.");
  }
  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: currentOrg.suspendedAt,
    subscriptionStatus: currentOrg.subscriptionStatus,
    trialEndsAt: currentOrg.trialEndsAt,
  });

  if (billingAccess.isLocked) {
    throw new MobileApiRequestError(403, getLockedOrgMessage(orgRole, billingAccess));
  }

  const setupComplete = await isMobileOrgSetupComplete(input.serviceClient, currentOrgId);
  if (!setupComplete) {
    throw new MobileApiRequestError(403, getIncompleteSetupMessage(orgRole));
  }

  // Inactive employees keep their session but lose every manage capability —
  // mirror the web behavior. Gridmaster mobile login is blocked earlier, so the
  // only callers with no employees row are unlinked super_admins (kept as-is).
  const { data: employeeRow } = await input.serviceClient
    .from("employees")
    .select("status")
    .eq("user_id", user.id)
    .eq("org_id", currentOrgId)
    .maybeSingle();
  const isInactive = (employeeRow?.status as string | null) === "inactive";

  return {
    accessToken: input.accessToken,
    user,
    claims,
    currentOrg,
    permissions: buildPermissionContext(orgRole, currentOrgId, adminPermissions, {
      isInactive,
    }),
    membership: {
      orgRole,
      adminPermissions,
    },
    memberships: membershipRows.map((membership) => ({
      orgId: membership.organization.id,
      orgName: membership.organization.name,
      orgSlug: membership.organization.slug,
      orgRole: membership.org_role ?? "user",
      platformRole,
    })),
    userClient: input.createUserClient(input.accessToken),
    serviceClient: input.serviceClient,
  };
}

export async function loginMobileUser(
  serviceClient: SupabaseClient,
  sessionClient: SupabaseClient,
  input: MobileAuthLoginBody,
): Promise<MobileAuthLoginResponse> {
  const organization = await requireMobileOrganization(serviceClient, input.orgSlug);
  const { session, user, mfaFactor } = await signInMobileUser(sessionClient, input);
  await assertMobileProfileSupported(serviceClient, user.id);

  const memberships = await loadMobileMemberships(sessionClient);
  const targetMembership = memberships.find(
    (membership) => membership.org_slug === organization.slug,
  );

  if (!targetMembership) {
    throw new MobileApiRequestError(403, "Your account is not associated with that organization.");
  }

  const loginBillingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: organization.suspendedAt,
    subscriptionStatus: organization.subscriptionStatus,
    trialEndsAt: organization.trialEndsAt,
  });

  if (loginBillingAccess.isLocked) {
    throw new MobileApiRequestError(
      403,
      getLockedOrgMessage(targetMembership.org_role ?? "user", loginBillingAccess),
    );
  }

  const currentSession = await switchMobileOrgIfNeeded(sessionClient, session, targetMembership);

  // First super_admin login starts the org's 14-day trial. This is a genuine
  // credential login (not automatic reconciliation like switchMobileOrgIfNeeded),
  // so it is a safe activation point. The RPC self-gates to super_admins and is
  // idempotent; we still guard on role to skip a needless call for members, and
  // never let a failure block sign-in.
  if (targetMembership.org_role === "super_admin") {
    const trialResult = await sessionClient.rpc("start_trial_for_org", {
      p_org_id: organization.id,
    });
    if (trialResult.error) {
      // Non-fatal: sign-in proceeds even if trial activation fails.
    }
  }

  const { firstName, lastName } = getMobileUserName(user);

  return {
    session: {
      accessToken: currentSession.access_token,
      refreshToken: currentSession.refresh_token,
      expiresIn: currentSession.expires_in,
      tokenType: currentSession.token_type,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    user: {
      id: user.id,
      email: user.email ?? null,
      firstName,
      lastName,
    },
    mfaRequired: mfaFactor !== null,
    mfa: mfaFactor
      ? {
          factorId: mfaFactor.id,
          friendlyName: mfaFactor.friendly_name ?? null,
        }
      : null,
  };
}
