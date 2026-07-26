import { NextResponse, type NextRequest } from "next/server";
import {
  mobileProfilePhoneUpdateBodySchema,
  mobileProfilePhoneUpdateResponseSchema,
  mobileProfileAccountUpdateBodySchema,
  mobileProfileAccountUpdateResponseSchema,
  mobileProfileMfaStatusUpdateBodySchema,
  mobileProfileMfaStatusUpdateResponseSchema,
  mobileProfileResponseSchema,
} from "@dubgrid/contracts";
import {
  fetchSelfProfileSnapshot,
  listOwnProfileChangeRequests,
  updateSelfProfileDetails,
  updateSelfLinkedEmployeePhone,
  updateSelfMfaStatus,
} from "@/features/account/server";
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

  const [profile, linkedEmployee, focusAreas, changeRequests] = await Promise.all([
    fetchSelfProfileSnapshot(auth.user.id),
    fetchLinkedEmployeeForUser(auth.serviceClient, auth.currentOrg.id, auth.user.id),
    fetchMobileFocusAreas(auth.serviceClient, auth.currentOrg.id),
    listOwnProfileChangeRequests({
      serviceClient: auth.serviceClient,
      userId: auth.user.id,
      orgId: auth.currentOrg.id,
    }),
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
        }
      : null,
    focusAreas,
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

// Mirrors /api/account/mfa-status: the actual TOTP enroll/verify/unenroll
// calls go straight from the mobile app to Supabase's auth.mfa.* endpoints
// (no backend route needed for those). This route only persists the
// denormalized profiles.mfa_enabled flag the profile screen displays.
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
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await updateSelfMfaStatus(auth.user.id, parsed.data.enabled);

  const payload = await buildMobileProfilePayload(auth);
  if ("response" in payload) {
    return payload.response;
  }

  return NextResponse.json(
    mobileProfileMfaStatusUpdateResponseSchema.parse({ user: payload.user }),
  );
}
