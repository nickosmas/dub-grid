import type {
  MobileAuthLoginBody,
  MobileAuthLoginResponse,
} from "@dubgrid/contracts";
import {
  buildPermissionContext,
  type PermissionContext,
} from "@dubgrid/authz";
import type {
  BillingAccessResult,
  AdminPermissions,
  Organization,
  PlatformRole,
} from "@dubgrid/domain";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import {
  createClient,
  type Factor,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import {
  findMobileOrganizationBySlug,
  type MobileOrganizationLookup,
} from "./organization";
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

type MobileAuthClaims = {
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

  constructor(status: number, message: string) {
    super(message);
    this.name = "MobileApiRequestError";
    this.status = status;
  }
}

function getMobileUserName(user: User): {
  firstName: string | null;
  lastName: string | null;
} {
  return {
    firstName:
      (user.user_metadata?.first_name as string | undefined) ?? null,
    lastName:
      (user.user_metadata?.last_name as string | undefined) ?? null,
  };
}

function getLockedOrgMessage(
  orgRole: string,
  billingAccess: BillingAccessResult,
): string {
  if (billingAccess.reason === "suspended") {
    return "Organization unavailable. Contact your organization administrator.";
  }

  if (orgRole === "super_admin") {
    return "Organization unavailable. Sign in on the web to manage billing.";
  }

  return "Organization unavailable. Your organization will be available once your organization administrator finishes setup.";
}

function getIncompleteSetupMessage(orgRole: string): string {
  if (orgRole === "super_admin" || orgRole === "admin") {
    return "Organization unavailable. Sign in on the web to finish organization setup.";
  }

  return "Organization unavailable. Your organization will be available once your organization administrator finishes setup.";
}

async function requireMobileOrganization(
  serviceClient: SupabaseClient,
  slug: string,
): Promise<MobileOrganizationLookup> {
  try {
    const organization = await findMobileOrganizationBySlug(serviceClient, slug);
    if (!organization) {
      throw new MobileApiRequestError(
        404,
        "No organization matched that slug.",
      );
    }

    return organization;
  } catch (error) {
    if (error instanceof MobileApiRequestError) {
      throw error;
    }

    throw new MobileApiRequestError(
      503,
      "We could not verify that organization right now.",
    );
  }
}

async function signInMobileUser(
  serviceClient: SupabaseClient,
  input: MobileAuthLoginBody,
): Promise<{
  session: SignedInSession;
  user: User;
  mfaFactor: Factor<"totp", "verified"> | null;
}> {
  const { data: authData, error: authError } =
    await serviceClient.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

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
    throw new MobileApiRequestError(
      403,
      "Verify your email on the web before using mobile.",
    );
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
    throw new MobileApiRequestError(
      503,
      "We could not finish signing you in right now.",
    );
  }

  if ((profile?.platform_role as string | null) === "gridmaster") {
    throw new MobileApiRequestError(
      403,
      "Gridmaster accounts are not supported in the mobile app.",
    );
  }
}

async function loadMobileMemberships(
  sessionClient: SupabaseClient,
): Promise<OrgMembership[]> {
  const membershipsResult = await sessionClient.rpc("get_my_organizations");

  if (membershipsResult.error) {
    throw new MobileApiRequestError(
      403,
      "We could not verify your organization access.",
    );
  }

  return (membershipsResult.data ?? []) as OrgMembership[];
}

async function switchMobileOrgIfNeeded(
  sessionClient: SupabaseClient,
  session: SignedInSession,
  membership: OrgMembership,
): Promise<SignedInSession> {
  if (membership.is_active) {
    return session;
  }

  const switchResult = await sessionClient.rpc("switch_org", {
    target_org_id: membership.org_id,
  });

  if (switchResult.error) {
    throw new MobileApiRequestError(
      400,
      "We could not switch your organization right now.",
    );
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

export function createMobileEphemeralAuthClient(
  url: string,
  anonKey: string,
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function extractMobileBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim() || null;
}

export async function resolveMobileAuthContext<
  TOrganizationRow,
  TOrganization extends Pick<
    Organization,
    "id" | "suspendedAt" | "subscriptionStatus" | "trialEndsAt"
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
}): Promise<ResolvedMobileAuthContext<TOrganization>> {
  const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] =
    await Promise.all([
      input.serviceClient.auth.getUser(input.accessToken),
      input.serviceClient.auth.getClaims(input.accessToken),
    ]);

  if (userError || claimsError || !userData.user || !claimsData?.claims) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  const user = userData.user;
  const claims = claimsData.claims as MobileAuthClaims;
  const hasVerifiedTotpFactor = (user.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  if (hasVerifiedTotpFactor && claims.aal !== "aal2") {
    throw new MobileApiRequestError(
      401,
      "Two-factor authentication required",
    );
  }

  if (claims.platform_role === "gridmaster") {
    throw new MobileApiRequestError(
      403,
      "Gridmaster mobile access is not supported",
    );
  }

  const membershipRows = await input.fetchMemberships(input.serviceClient, user.id);
  if (membershipRows.length === 0) {
    throw new MobileApiRequestError(
      403,
      "No active organization membership found",
    );
  }

  const currentOrgId =
    typeof claims.org_id === "string" && claims.org_id.length > 0
      ? claims.org_id
      : membershipRows[0]?.organization.id ?? null;

  if (!currentOrgId) {
    throw new MobileApiRequestError(403, "Missing organization context");
  }

  const currentMembership = membershipRows.find(
    (membership) => membership.organization.id === currentOrgId,
  );
  if (!currentMembership) {
    throw new MobileApiRequestError(
      403,
      "Organization context does not match this user",
    );
  }

  const currentOrgRow = await input.fetchOrganization(
    input.serviceClient,
    currentOrgId,
  );
  if (!currentOrgRow) {
    throw new MobileApiRequestError(404, "Organization not found");
  }

  const platformRole =
    (await input.fetchPlatformRole(input.serviceClient, user.id)) ?? "none";
  const adminPermissions = currentMembership.admin_permissions ?? null;
  const orgRole = currentMembership.org_role ?? "user";
  const currentOrg = input.mapOrganization(currentOrgRow);
  const billingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: currentOrg.suspendedAt,
    subscriptionStatus: currentOrg.subscriptionStatus,
    trialEndsAt: currentOrg.trialEndsAt,
  });

  if (billingAccess.isLocked) {
    throw new MobileApiRequestError(
      403,
      getLockedOrgMessage(orgRole, billingAccess),
    );
  }

  const setupComplete = await isMobileOrgSetupComplete(
    input.serviceClient,
    currentOrgId,
  );
  if (!setupComplete) {
    throw new MobileApiRequestError(
      403,
      getIncompleteSetupMessage(orgRole),
    );
  }

  return {
    accessToken: input.accessToken,
    user,
    claims,
    currentOrg,
    permissions: buildPermissionContext(orgRole, currentOrgId, adminPermissions),
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
  const organization = await requireMobileOrganization(
    serviceClient,
    input.orgSlug,
  );
  const { session, user, mfaFactor } = await signInMobileUser(
    serviceClient,
    input,
  );
  await assertMobileProfileSupported(serviceClient, user.id);

  const { error: setSessionError } = await sessionClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (setSessionError) {
    throw new MobileApiRequestError(
      503,
      "We could not finish signing you in right now.",
    );
  }

  const memberships = await loadMobileMemberships(sessionClient);
  const targetMembership = memberships.find(
    (membership) => membership.org_slug === organization.slug,
  );

  if (!targetMembership) {
    throw new MobileApiRequestError(
      403,
      "Your account is not associated with that organization.",
    );
  }

  const loginBillingAccess = evaluateOrganizationBillingAccess({
    suspendedAt: organization.suspendedAt,
    subscriptionStatus: organization.subscriptionStatus,
    trialEndsAt: organization.trialEndsAt,
  });

  if (loginBillingAccess.isLocked) {
    throw new MobileApiRequestError(
      403,
      getLockedOrgMessage(
        targetMembership.org_role ?? "user",
        loginBillingAccess,
      ),
    );
  }

  const currentSession = await switchMobileOrgIfNeeded(
    sessionClient,
    session,
    targetMembership,
  );

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
