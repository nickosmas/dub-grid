import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { resolveVerifiedTotpFactorPresence } from "@dubgrid/authz";
import {
  mobileProfilePhoneUpdateBodySchema,
  mobileProfilePhoneUpdateResponseSchema,
  mobileProfileAccountUpdateBodySchema,
  mobileProfileAccountUpdateResponseSchema,
  mobileProfileMfaStatusUpdateBodySchema,
  mobileProfileMfaStatusUpdateResponseSchema,
  mobileProfileResponseSchema,
  mobileTermsAcceptanceResponseSchema,
} from "@dubgrid/contracts";
import {
  fetchSelfProfileSnapshot,
  listOwnProfileChangeRequests,
  updateSelfProfileDetails,
  updateSelfLinkedEmployeePhone,
  updateSelfMfaStatus,
  recordCurrentTermsAcceptance,
} from "@/features/account/server";
import { fetchMobileManagementMembershipRowsByUserIds } from "@dubgrid/data-access";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  fetchLinkedEmployeeForUser,
  fetchMobileFocusAreas,
  mapOrganizationToMobileConfig,
  requireMobileAuth,
} from "@/features/mobile/server";
import { getEffectiveMobileRole } from "@dubgrid/mobile-api-core";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
} from "@/lib/staff-validation";

function readUserMetadataName(value: unknown): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!value || typeof value !== "object") {
    return { firstName: null, lastName: null };
  }

  const metadata = value as { first_name?: unknown; last_name?: unknown };
  return {
    firstName: typeof metadata.first_name === "string" ? metadata.first_name : null,
    lastName: typeof metadata.last_name === "string" ? metadata.last_name : null,
  };
}

async function buildMobileProfilePayload(auth: Awaited<ReturnType<typeof requireMobileAuth>>) {
  if ("response" in auth) {
    return auth;
  }

  const [profile, linkedEmployee, focusAreas, changeRequests, managementMemberships] =
    await Promise.all([
      fetchSelfProfileSnapshot(auth.user.id),
      fetchLinkedEmployeeForUser(auth.serviceClient, auth.currentOrg.id, auth.user.id),
      fetchMobileFocusAreas(auth.serviceClient, auth.currentOrg.id),
      listOwnProfileChangeRequests({
        serviceClient: auth.serviceClient,
        userId: auth.user.id,
        orgId: auth.currentOrg.id,
      }),
      // The membership row this account's management access lives on. The
      // auth context already reads the same table for the org role, but it
      // keeps only the role and the admin permissions, and management
      // departments are neither.
      fetchMobileManagementMembershipRowsByUserIds(auth.serviceClient, auth.currentOrg.id, [
        auth.user.id,
      ]),
    ]);
  const metadataName = readUserMetadataName(auth.user.user_metadata);
  const firstName = profile?.firstName ?? metadataName.firstName;
  const lastName = profile?.lastName ?? metadataName.lastName;

  return {
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      firstName,
      lastName,
      createdAt: auth.user.created_at ?? null,
      lastSignInAt: auth.user.last_sign_in_at ?? null,
      mfaEnabled: profile?.mfaEnabled ?? false,
    },
    currentOrg: mapOrganizationToMobileConfig(auth.currentOrg),
    currentMembership: {
      id: auth.currentOrg.id,
      name: auth.currentOrg.name,
      slug: auth.currentOrg.slug,
      orgRole: getEffectiveMobileRole(auth.membership?.orgRole ?? "user"),
      platformRole: "none" as const,
      isCurrent: true,
    },
    effectiveRole: getEffectiveMobileRole(auth.permissions.role),
    linkedEmployee: linkedEmployee
      ? {
          id: linkedEmployee.id,
          firstName: linkedEmployee.firstName,
          lastName: linkedEmployee.lastName,
          employmentType: linkedEmployee.employmentType,
          status: linkedEmployee.status,
          phone: linkedEmployee.phone,
          email: linkedEmployee.email,
          certificationId: linkedEmployee.certificationId,
          roleIds: linkedEmployee.roleIds,
          focusAreaIds: linkedEmployee.focusAreaIds,
          departmentIds: linkedEmployee.departmentIds,
          contactNotes: linkedEmployee.contactNotes,
          version: linkedEmployee.version,
          employeeNumber: linkedEmployee.employeeNumber,
        }
      : null,
    focusAreas,
    managementDepartmentIds:
      managementMemberships.find((row) => row.user_id === auth.user.id)?.department_ids ?? [],
    pendingProfileChangeRequest: changeRequests.some(
      (request) => request.type === "profile_update" && request.status === "pending",
    ),
    pendingAccountDeletionRequest: changeRequests.some(
      (request) => request.type === "account_deletion" && request.status === "pending",
    ),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const payload = await buildMobileProfilePayload(auth);
  return NextResponse.json(mobileProfileResponseSchema.parse(payload));
}

export async function PATCHAccount(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that profile update. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileProfileAccountUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
  }

  if (!auth.permissions.canManageEmployees) {
    return NextResponse.json(
      {
        error: "Profile details are changed by admins. Submit a profile change request instead.",
      },
      { status: 403 },
    );
  }

  await updateSelfProfileDetails({
    userId: auth.user.id,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    orgId: auth.currentOrg.id,
  });

  const payload = await buildMobileProfilePayload(auth);
  if ("response" in payload) {
    return payload.response;
  }

  return NextResponse.json(
    mobileProfileAccountUpdateResponseSchema.parse({
      user: payload.user,
      linkedEmployee: payload.linkedEmployee,
    }),
  );
}

export async function PATCHPhone(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that phone update. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileProfilePhoneUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
  }

  let result;
  try {
    result = await updateSelfLinkedEmployeePhone({
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      orgId: auth.currentOrg.id,
      phone: parsed.data.phone,
      expectedVersion: parsed.data.expectedVersion,
    });
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }
    throw error;
  }

  const payload = await buildMobileProfilePayload(auth);
  if ("response" in payload) {
    return payload.response;
  }

  return NextResponse.json(
    mobileProfilePhoneUpdateResponseSchema.parse({
      linkedEmployee: payload.linkedEmployee ?? {
        ...result.employee,
        employmentType: result.employee.employmentType,
      },
    }),
  );
}

// This reconciles a display flag, not a factor mutation or a step-up proof.
export async function PATCHMfaStatus(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileProfileMfaStatusUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  // requireMobileAuth resolves this user through live Supabase Auth.
  const enabled = resolveVerifiedTotpFactorPresence(auth.user.factors);
  if (enabled === null) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  await updateSelfMfaStatus(auth.user.id, enabled);

  const payload = await buildMobileProfilePayload(auth);
  if ("response" in payload) {
    return payload.response;
  }

  return NextResponse.json(
    mobileProfileMfaStatusUpdateResponseSchema.parse({
      user: { ...payload.user, mfaEnabled: enabled },
    }),
  );
}

/**
 * Mobile counterpart to `POST /api/account/terms`. The web route authenticates
 * from cookies and enforces a CSRF origin check, neither of which applies to a
 * Bearer-token native client — hence a separate handler over the same
 * `recordCurrentTermsAcceptance` write.
 */
export async function POSTTerms(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  await recordCurrentTermsAcceptance(auth.user.id);

  return NextResponse.json(
    mobileTermsAcceptanceResponseSchema.parse({ acceptedCurrentTerms: true }),
  );
}
