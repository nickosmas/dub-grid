import type { MobileAuthLoginBody, MobileAuthLoginResponse } from "@dubgrid/contracts";
import {
  buildPermissionContext,
  type AuthenticationAssuranceClaims,
  type PermissionContext,
} from "@dubgrid/authz";
import type {
  BillingAccessResult,
  BillingPolicy,
  AdminPermissions,
  Organization,
  PlatformRole,
} from "@dubgrid/domain";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
  evaluateBillingAccessWithPolicy,
  isAccountDisabledMessage,
  isAccountSuspendedMessage,
  suspendedUntilFromMessage,
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

export type MobileAuthClaims = AuthenticationAssuranceClaims & {
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
    /** When this membership was created: the day the person joined the organization. */
    joinedAt: string | null;
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
  /** Extra fields for the response body, such as a suspension's end. */
  readonly details: Record<string, string>;

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    details: Record<string, string> = {},
  ) {
    super(message);
    this.name = "MobileApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
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
      return "Organization unavailable. Contact DubGrid Support for help.";
    }
    return "Organization unavailable. Sign in on the web to manage billing.";
  }

  return "Organization unavailable. Try again later.";
}

function getIncompleteSetupMessage(orgRole: string): string {
  if (orgRole === "super_admin") {
    return "Organization unavailable. Sign in on the web to finish organization setup.";
  }

  return "Organization unavailable. Try again later.";
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
        "We couldn't find that organization. Check the domain and try again.",
      );
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
  if (authError && isAccountSuspendedMessage(authError.message)) {
    // The hook names a suspension's end (105), for "until Fri, Nov 20".
    const suspendedUntil = suspendedUntilFromMessage(authError.message);
    throw new MobileApiRequestError(
      403,
      ACCOUNT_SUSPENDED_MESSAGE,
      ACCOUNT_SUSPENDED_CODE,
      suspendedUntil ? { suspendedUntil } : {},
    );
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
    throw new MobileApiRequestError(
      403,
      "Finish setting up your account from your invitation email, then sign in.",
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

/**
 * Starts `read` now and returns its promise to await later. A refusal earlier
 * in the chain means this one may never be awaited, so a no-op handler keeps
 * its rejection from going unhandled; awaiting it still throws. A synchronous
 * throw is turned into a rejection so it, too, waits for its turn.
 */
function startEarly<T>(read: () => PromiseLike<T> | T): Promise<T> {
  const started = new Promise<T>((resolve) => resolve(read()));
  started.catch(() => {});
  return started;
}

export async function resolveMobileAuthContext<
  TOrganizationRow,
  TOrganization extends Pick<
    Organization,
    | "id"
    | "archivedAt"
    | "suspendedAt"
    | "subscriptionStatus"
    | "trialEndsAt"
    | "billingPolicyOverrides"
    | "billingPausedAt"
    | "paymentGraceStartedAt"
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
  /** Lets the sensitive-action adapter turn AAL1 into its structured step-up response. */
  allowAal1ForStepUp?: boolean;
  /**
   * The platform's billing defaults. Injected so this package stays
   * platform-neutral; without it the built-in defaults apply.
   */
  loadPlatformBillingPolicy?: () => Promise<BillingPolicy>;
}): Promise<ResolvedMobileAuthContext<TOrganization>> {
  const verified = await input.verifyToken(input.accessToken);
  if (!verified) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  const claims = verified.claims;
  // The claim, or nothing. This used to fall back to `membershipRows[0]`, and
  // that query has no ORDER BY, so a token whose org claim the access-token
  // hook had stripped (its org archived or suspended, its membership revoked)
  // silently adopted an arbitrary one of the user's other organizations and
  // built the whole PermissionContext for it, which meant writes landed there
  // too. Refusing (below, in its original place) is the only safe reading of
  // "this token names no org": the client's answer is to switch deliberately,
  // which re-mints the claim.
  const currentOrgId =
    typeof claims.org_id === "string" && claims.org_id.length > 0 ? claims.org_id : null;

  // Every read below needs only the verified token, so they all start now and
  // are awaited one at a time in the order the checks have always run. Each
  // request gets the same allow or deny answer, without paying for ten round
  // trips in a row. Only a validly signed token reaches this point.
  const revoked = startEarly(() =>
    input.isRevoked({
      userId: verified.userId,
      sessionId: verified.sessionId,
      issuedAtMs: verified.issuedAtMs,
    }),
  );
  // The one call to Supabase Auth still on this path, and it is load-bearing.
  //
  // Without it a password-only (aal1) token would satisfy a user who has TOTP
  // enrolled, which is an MFA bypass. Enrolled factors live in `auth.mfa_factors`,
  // which PostgREST does not expose, and they are not carried in the JWT, so
  // there is no way to answer "does this user have a verified factor?" locally
  // today. `profiles.mfa_enabled` is NOT a substitute: the client writes it
  // after enrolling, so a client that skips that call leaves it false, and a
  // stale `false` is exactly the direction that reopens the bypass.
  const userResult = startEarly(() => input.serviceClient.auth.getUser(input.accessToken));
  const platformRoleResult = startEarly(() =>
    input.fetchPlatformRole(input.serviceClient, verified.userId),
  );
  const membershipRowsResult = startEarly(() =>
    input.fetchMemberships(input.serviceClient, verified.userId),
  );
  const orgReads = currentOrgId
    ? {
        orgRow: startEarly(() => input.fetchOrganization(input.serviceClient, currentOrgId)),
        billingPolicy: startEarly(async () => input.loadPlatformBillingPolicy?.()),
        setupComplete: startEarly(() =>
          isMobileOrgSetupComplete(input.serviceClient, currentOrgId),
        ),
        employee: startEarly(() =>
          input.serviceClient
            .from("employees")
            .select("status")
            .eq("user_id", verified.userId)
            .eq("org_id", currentOrgId)
            .maybeSingle(),
        ),
      }
    : null;

  if (await revoked) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  const { data: userData, error: userError } = await userResult;

  // The reads above were keyed on the verified token's subject; Auth must agree.
  if (userError || !userData.user || userData.user.id !== verified.userId) {
    throw new MobileApiRequestError(401, "Invalid session");
  }

  const user = userData.user;
  const hasVerifiedTotpFactor = (user.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  if (hasVerifiedTotpFactor && claims.aal !== "aal2" && !input.allowAal1ForStepUp) {
    throw new MobileApiRequestError(401, "Two-factor authentication required");
  }

  const platformRole = (await platformRoleResult) ?? "none";
  if (platformRole === "gridmaster") {
    throw new MobileApiRequestError(403, "Gridmaster mobile access is not supported");
  }

  const membershipRows = await membershipRowsResult;
  if (membershipRows.length === 0) {
    throw new MobileApiRequestError(
      403,
      "You're no longer in an organization. Ask an Admin if that's a mistake.",
    );
  }

  if (!currentOrgId || !orgReads) {
    throw new MobileApiRequestError(
      403,
      "Your session is not tied to an organization. Sign in again to pick one.",
    );
  }

  const currentMembership = membershipRows.find(
    (membership) => membership.organization.id === currentOrgId,
  );
  if (!currentMembership) {
    throw new MobileApiRequestError(
      403,
      "You're no longer in this organization. Sign in again to pick another.",
    );
  }

  const currentOrgRow = await orgReads.orgRow;
  if (!currentOrgRow) {
    throw new MobileApiRequestError(404, "Organization not found");
  }

  const adminPermissions = currentMembership.admin_permissions ?? null;
  const orgRole = currentMembership.org_role ?? "user";
  const currentOrg = input.mapOrganization(currentOrgRow);
  if (currentOrg.archivedAt) {
    throw new MobileApiRequestError(403, "Organization unavailable. Try again later.");
  }
  const billingAccess = evaluateBillingAccessWithPolicy(
    {
      suspendedAt: currentOrg.suspendedAt,
      subscriptionStatus: currentOrg.subscriptionStatus,
      trialEndsAt: currentOrg.trialEndsAt,
      billingPausedAt: currentOrg.billingPausedAt,
      paymentGraceStartedAt: currentOrg.paymentGraceStartedAt,
    },
    await orgReads.billingPolicy,
    currentOrg.billingPolicyOverrides,
  );

  if (billingAccess.isLocked) {
    throw new MobileApiRequestError(403, getLockedOrgMessage(orgRole, billingAccess));
  }

  const setupComplete = await orgReads.setupComplete;
  if (!setupComplete) {
    throw new MobileApiRequestError(403, getIncompleteSetupMessage(orgRole));
  }

  // Reported only: an inactive (Away) person keeps their role's permissions.
  const { data: employeeRow } = await orgReads.employee;
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
      joinedAt: currentMembership.joined_at ?? null,
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
  deps: { loadPlatformBillingPolicy?: () => Promise<BillingPolicy> } = {},
): Promise<MobileAuthLoginResponse> {
  // Started first and awaited where it was always used, so a refusal before
  // then still answers first.
  const billingPolicy = startEarly(async () => deps.loadPlatformBillingPolicy?.());
  const organization = await requireMobileOrganization(serviceClient, input.orgSlug);
  const { session, user, mfaFactor } = await signInMobileUser(sessionClient, input);

  // Both run on the new session, awaited in the order they always refused in.
  const profileCheck = startEarly(() => assertMobileProfileSupported(serviceClient, user.id));
  const membershipsResult = startEarly(() => loadMobileMemberships(sessionClient));
  await profileCheck;
  const memberships = await membershipsResult;
  const targetMembership = memberships.find(
    (membership) => membership.org_slug === organization.slug,
  );

  if (!targetMembership) {
    throw new MobileApiRequestError(403, "Your account is not associated with that organization.");
  }

  const loginBillingAccess = evaluateBillingAccessWithPolicy(
    {
      suspendedAt: organization.suspendedAt,
      subscriptionStatus: organization.subscriptionStatus,
      trialEndsAt: organization.trialEndsAt,
      billingPausedAt: organization.billingPausedAt,
      paymentGraceStartedAt: organization.paymentGraceStartedAt,
    },
    await billingPolicy,
    organization.billingPolicyOverrides,
  );

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
