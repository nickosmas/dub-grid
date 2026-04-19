import {
  assignOrgRoleByEmail,
  createOrganization,
  insertEmployee,
  saveCertifications,
  saveDepartments,
  saveOrganizationRoles,
  sendInvitation,
  updateOrganization,
  upsertFocusArea,
  upsertShiftCategory,
  upsertShiftCode,
} from "@/lib/db";
import { withComposedOrganizationAddress } from "@/lib/organization-profile";
import * as Sentry from "@/lib/sentry";
import type {
  AssignableOrganizationRole,
  Organization,
} from "@/types";
import type {
  CreatedEmployee,
  DeptRow,
  EmployeeRow,
  FocusAreaRow,
  InvitationRow,
  NamedItemRow,
  PendingInvite,
  ShiftCatRow,
  ShiftCodeRow,
} from "./types";

export async function validateOrganizationSlug(slug: string): Promise<boolean> {
  if (!slug) return false;

  try {
    const response = await fetch(
      `/api/validate-domain?slug=${encodeURIComponent(slug)}`,
    );
    const json = await response.json();
    return json.valid === false;
  } catch {
    return false;
  }
}

type CreateOrganizationSetupInput = {
  name: string;
  slug: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  phone: string;
  timezone: string;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  shiftDisplayMode: "code" | "name";
  superAdminFirstName: string;
  superAdminLastName: string;
  superAdminEmail: string;
  superAdminPhone: string;
};

export type SuperAdminSetupResult =
  | { kind: "none" }
  | { kind: "assigned"; displayName: string }
  | { kind: "pending-invite"; displayName: string; pendingInvite: PendingInvite }
  | { kind: "invite-error"; displayName: string; message: string };

export async function createOrganizationSetup(
  input: CreateOrganizationSetupInput,
): Promise<{
  org: Organization;
  superAdmin: SuperAdminSetupResult;
}> {
  const org = await createOrganization({
    name: input.name.trim(),
    slug: input.slug.trim() || null,
    ...withComposedOrganizationAddress({
      addressLine1: input.addressLine1.trim(),
      addressLine2: input.addressLine2.trim(),
      addressCity: input.addressCity.trim(),
      addressState: input.addressState.trim(),
      addressPostalCode: input.addressPostalCode.trim(),
      addressCountry: input.addressCountry.trim(),
    }),
    phone: input.phone.trim(),
    employeeCount: null,
    focusAreaLabel: input.focusAreaLabel.trim() || "Focus Areas",
    certificationLabel: input.certificationLabel.trim() || "Certifications",
    roleLabel: input.roleLabel.trim() || "Roles",
    departmentLabel: "Departments",
    shiftDisplayMode: input.shiftDisplayMode,
    timezone: input.timezone || null,
    enforceConflictPrevention: false,
    dataRetentionDays: 365,
    featureOverrides: {},
  });

  if (
    !input.superAdminEmail.trim() ||
    !input.superAdminFirstName.trim() ||
    !input.superAdminLastName.trim()
  ) {
    return {
      org,
      superAdmin: { kind: "none" },
    };
  }

  const email = input.superAdminEmail.trim();
  const firstName = input.superAdminFirstName.trim();
  const lastName = input.superAdminLastName.trim();
  const phone = input.superAdminPhone.trim();
  const displayName = `${firstName} ${lastName}`;

  let employeeId: string | undefined;

  try {
    const employee = await insertEmployee(
      {
        firstName,
        lastName,
        email,
        phone,
        seniority: 0,
        certificationId: null,
        roleIds: [],
        focusAreaIds: [],
        contactNotes: "",
        status: "active",
        statusChangedAt: null,
        statusNote: "",
        userId: null,
        departmentIds: [],
        deptAdminIds: [],
        version: 0,
      },
      org.id,
    );
    employeeId = employee.id;
  } catch (err: unknown) {
    Sentry.captureException(err);
  }

  try {
    await assignOrgRoleByEmail(org.id, email, "super_admin");
    return {
      org,
      superAdmin: {
        kind: "assigned",
        displayName,
      },
    };
  } catch {
    // Fall through to invitation flow.
  }

  try {
    const invitation = await sendInvitation(
      email,
      "super_admin",
      org.id,
      employeeId,
    );
    return {
      org,
      superAdmin: {
        kind: "pending-invite",
        displayName,
        pendingInvite: {
          token: invitation.token,
          email,
          name: displayName,
        },
      },
    };
  } catch (err: unknown) {
    return {
      org,
      superAdmin: {
        kind: "invite-error",
        displayName,
        message:
          err instanceof Error ? err.message : "Unknown invitation error",
      },
    };
  }
}

type SaveOrganizationConfigInput = {
  createdOrg: Organization;
  shiftDisplayMode: "code" | "name";
  departments: DeptRow[];
  focusAreas: FocusAreaRow[];
  certifications: NamedItemRow[];
  orgRoles: NamedItemRow[];
  shiftCategories: ShiftCatRow[];
  shiftCodes: ShiftCodeRow[];
};

export async function saveOrganizationSetupConfig({
  createdOrg,
  shiftDisplayMode,
  departments,
  focusAreas,
  certifications,
  orgRoles,
  shiftCategories,
  shiftCodes,
}: SaveOrganizationConfigInput): Promise<number> {
  let savedCount = 0;

  if (shiftDisplayMode !== "code") {
    await updateOrganization({ ...createdOrg, shiftDisplayMode });
  }

  const validDepartments = departments.filter((department) =>
    department.name.trim(),
  );
  if (validDepartments.length > 0) {
    await saveDepartments(
      createdOrg.id,
      validDepartments.map((department, index) => ({
        id: -(index + 1),
        orgId: createdOrg.id,
        name: department.name.trim(),
        abbr: department.abbr.trim(),
        type: department.type,
        sortOrder: index,
      })),
      [],
    );
    savedCount += validDepartments.length;
  }

  const validFocusAreas = focusAreas.filter((focusArea) => focusArea.name.trim());
  for (let index = 0; index < validFocusAreas.length; index += 1) {
    const focusArea = validFocusAreas[index];
    await upsertFocusArea({
      orgId: createdOrg.id,
      departmentId: null,
      name: focusArea.name.trim(),
      sortOrder: index,
    });
  }
  savedCount += validFocusAreas.length;

  const validCertifications = certifications.filter((item) => item.name.trim());
  if (validCertifications.length > 0) {
    await saveCertifications(
      createdOrg.id,
      validCertifications.map((item, index) => ({
        id: 0,
        orgId: createdOrg.id,
        name: item.name.trim(),
        abbr: item.abbr.trim() || item.name.trim().slice(0, 4).toUpperCase(),
        sortOrder: index,
      })),
      [],
    );
    savedCount += validCertifications.length;
  }

  const validRoles = orgRoles.filter((item) => item.name.trim());
  if (validRoles.length > 0) {
    await saveOrganizationRoles(
      createdOrg.id,
      validRoles.map((item, index) => ({
        id: 0,
        orgId: createdOrg.id,
        name: item.name.trim(),
        abbr: item.abbr.trim() || item.name.trim().slice(0, 4).toUpperCase(),
        sortOrder: index,
      })),
      [],
    );
    savedCount += validRoles.length;
  }

  const validCategories = shiftCategories.filter((category) => category.name.trim());
  for (let index = 0; index < validCategories.length; index += 1) {
    const category = validCategories[index];
    await upsertShiftCategory({
      orgId: createdOrg.id,
      name: category.name.trim(),
      color: category.color,
      startTime: category.startTime || null,
      endTime: category.endTime || null,
      sortOrder: index,
      focusAreaId: null,
      breakMinutes: null,
    });
  }
  savedCount += validCategories.length;

  const validCodes = shiftCodes.filter(
    (shiftCode) => shiftCode.label.trim() || shiftCode.name.trim(),
  );
  for (let index = 0; index < validCodes.length; index += 1) {
    const shiftCode = validCodes[index];
    await upsertShiftCode({
      orgId: createdOrg.id,
      label:
        shiftCode.label.trim() ||
        shiftCode.name.trim().slice(0, 3).toUpperCase(),
      name: shiftCode.name.trim() || shiftCode.label.trim(),
      color: shiftCode.color,
      border: shiftCode.color,
      text: "#FFFFFF",
      sortOrder: index,
      isGeneral: false,
      focusAreaId: null,
      categoryId: null,
      requiredCertificationIds: [],
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
    });
  }
  savedCount += validCodes.length;

  return savedCount;
}

export async function createOrganizationEmployees(
  createdOrg: Organization,
  employeeRows: EmployeeRow[],
): Promise<CreatedEmployee[]> {
  const validRows = employeeRows.filter((row) => row.firstName.trim());
  const created: CreatedEmployee[] = [];

  for (const row of validRows) {
    const employee = await insertEmployee(
      {
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        email: row.email.trim(),
        phone: row.phone.trim(),
        seniority: created.length + 1,
        certificationId: null,
        roleIds: [],
        focusAreaIds: [],
        contactNotes: "",
        status: "active" as const,
        statusChangedAt: null,
        statusNote: "",
        userId: null,
        departmentIds: [],
        deptAdminIds: [],
        version: 0,
      },
      createdOrg.id,
    );
    created.push({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
    });
  }

  return created;
}

export async function sendInvitationEmail(input: {
  token: string;
  email: string;
  orgName: string;
}): Promise<void> {
  const response = await fetch("/api/send-invite-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error ?? "Failed to send email");
  }
}

export async function sendOrganizationInvitations(
  createdOrg: Organization,
  invitationRows: InvitationRow[],
): Promise<{ sentCount: number; failCount: number }> {
  let sentCount = 0;
  let failCount = 0;

  for (const invitationRow of invitationRows) {
    try {
      const result = await sendInvitation(
        invitationRow.email,
        invitationRow.role as AssignableOrganizationRole,
        createdOrg.id,
        invitationRow.employeeId,
      );
      try {
        await sendInvitationEmail({
          token: result.token,
          email: invitationRow.email,
          orgName: createdOrg.name,
        });
      } catch {
        // Invitation exists even if email delivery fails.
      }
      sentCount += 1;
    } catch {
      failCount += 1;
    }
  }

  return {
    sentCount,
    failCount,
  };
}
