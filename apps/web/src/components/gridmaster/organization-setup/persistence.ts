import {
  insertEmployee,
} from "@/features/employees/client";
import {
  createGridmasterOrganizationSetup,
} from "@/features/gridmaster/client";
import {
  createOrganizationInvitation,
  updateOrganizationSettings,
} from "@/features/organization/client";
import {
  saveCertifications,
  saveDepartments,
  saveOrganizationRoles,
  upsertFocusArea,
  upsertJobDefinition,
  upsertShiftCategory,
} from "@/features/settings/client";
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
  JobRow,
  NamedItemRow,
  PendingInvite,
  ShiftCatRow,
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
  return createGridmasterOrganizationSetup(input);
}

type SaveOrganizationConfigInput = {
  createdOrg: Organization;
  shiftDisplayMode: "code" | "name";
  departments: DeptRow[];
  focusAreas: FocusAreaRow[];
  certifications: NamedItemRow[];
  orgRoles: NamedItemRow[];
  shiftCategories: ShiftCatRow[];
  jobs: JobRow[];
};

export async function saveOrganizationSetupConfig({
  createdOrg,
  shiftDisplayMode,
  departments,
  focusAreas,
  certifications,
  orgRoles,
  shiftCategories,
  jobs,
}: SaveOrganizationConfigInput): Promise<number> {
  let savedCount = 0;

  if (shiftDisplayMode !== "code") {
    await updateOrganizationSettings({
      orgId: createdOrg.id,
      expectedUpdatedAt: createdOrg.updatedAt ?? new Date(0).toISOString(),
      shiftDisplayMode,
    });
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
      startTime: category.startTime || null,
      endTime: category.endTime || null,
      sortOrder: index,
      focusAreaId: null,
      breakMinutes: null,
    });
  }
  savedCount += validCategories.length;

  const validJobs = jobs.filter(
    (job) => job.label.trim() || job.name.trim(),
  );
  for (let index = 0; index < validJobs.length; index += 1) {
    const job = validJobs[index];
    await upsertJobDefinition({
      orgId: createdOrg.id,
      name: job.name.trim() || job.label.trim(),
      abbr:
        job.label.trim().toUpperCase() ||
        job.name.trim().slice(0, 4).toUpperCase(),
      showOnGrid: true,
      assignmentMode: "with_shift",
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: job.color,
      border: job.color,
      text: "#FFFFFF",
      sortOrder: index,
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
    });
  }
  savedCount += validJobs.length;

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
      const result = await createOrganizationInvitation({
        email: invitationRow.email,
        role: invitationRow.role as AssignableOrganizationRole,
        orgId: createdOrg.id,
        employeeId: invitationRow.employeeId,
      });
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
