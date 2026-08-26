import { insertEmployee } from "@/features/employees/client";
import { createGridmasterOrganizationSetup } from "@/features/gridmaster/client";
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
import { formatClientErrorMessage } from "@/lib/client-facing";
import { DEFAULT_PREDEFINED_COLOR_BG } from "@/lib/colors";
import { normalizeCode, normalizeLineText } from "@/lib/form-validation";
import type { AssignableOrganizationRole, Organization } from "@/types";
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

type CreateOrganizationSetupInput = {
  name: string;
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

export async function createOrganizationSetup(input: CreateOrganizationSetupInput): Promise<{
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
  const departmentIdMap = new Map<string, number>();
  const focusAreaIdMap = new Map<string, number>();
  const shiftCategoryIdMap = new Map<string, number>();
  const validDepartments = departments.filter((department) => department.name.trim());
  const validFocusAreas = focusAreas.filter((focusArea) => focusArea.name.trim());
  const validCertifications = certifications.filter((item) => item.name.trim());
  const validRoles = orgRoles.filter((item) => item.name.trim());
  const validCategories = shiftCategories.filter((category) => category.name.trim());
  const validJobs = jobs.filter((job) => job.label.trim() || job.name.trim());
  const scheduledDepartmentRowIds = new Set(
    validDepartments
      .filter((department) => department.type === "scheduled")
      .map((department) => department.id),
  );
  const focusAreaRowIds = new Set(validFocusAreas.map((focusArea) => focusArea.id));
  const shiftCategoryRowIds = new Set(validCategories.map((category) => category.id));

  if (
    validFocusAreas.some(
      (focusArea) =>
        focusArea.departmentId == null || !scheduledDepartmentRowIds.has(focusArea.departmentId),
    )
  ) {
    throw new Error(
      "Assign each focus area to a scheduled department before saving configuration.",
    );
  }

  if (
    validCategories.some(
      (category) => category.focusAreaId == null || !focusAreaRowIds.has(category.focusAreaId),
    )
  ) {
    throw new Error("Assign each shift to a focus area before saving configuration.");
  }

  if (
    validJobs.some((job) => {
      const hasDepartment = job.departmentIds.some((id) => scheduledDepartmentRowIds.has(id));
      const hasFocusArea = job.focusAreaIds.some((id) => focusAreaRowIds.has(id));
      const hasShift = job.shiftCategoryIds.some((id) => shiftCategoryRowIds.has(id));
      return !hasDepartment || !hasFocusArea || !hasShift;
    })
  ) {
    throw new Error(
      "Assign each job to a scheduled department, focus area, and shift before saving configuration.",
    );
  }

  if (shiftDisplayMode !== "code") {
    await updateOrganizationSettings({
      orgId: createdOrg.id,
      expectedUpdatedAt: createdOrg.updatedAt ?? new Date(0).toISOString(),
      shiftDisplayMode,
    });
  }

  if (validDepartments.length > 0) {
    const savedDepartments = await saveDepartments(
      createdOrg.id,
      validDepartments.map((department, index) => ({
        id: -(index + 1),
        orgId: createdOrg.id,
        name: normalizeLineText(department.name, {
          label: "Department name",
          maxLength: 80,
          required: true,
          disallowUrl: true,
        }),
        abbr: normalizeCode(department.abbr, {
          label: "Department code",
          maxLength: 6,
          required: true,
          uppercase: true,
        }),
        type: department.type,
        sortOrder: index,
      })),
      [],
    );
    validDepartments.forEach((department, index) => {
      const saved = savedDepartments[index];
      if (!saved) return;
      departmentIdMap.set(department.id, saved.id);
    });
    savedCount += validDepartments.length;
  }

  for (let index = 0; index < validFocusAreas.length; index += 1) {
    const focusArea = validFocusAreas[index];
    const departmentId =
      (focusArea.departmentId ? departmentIdMap.get(focusArea.departmentId) : undefined) ?? null;
    const saved = await upsertFocusArea({
      orgId: createdOrg.id,
      departmentId,
      name: normalizeLineText(focusArea.name, {
        label: "Focus area name",
        maxLength: 80,
        required: true,
        disallowUrl: true,
      }),
      color: null,
      sortOrder: index,
    });
    focusAreaIdMap.set(focusArea.id, saved.id);
  }
  savedCount += validFocusAreas.length;

  if (validCertifications.length > 0) {
    await saveCertifications(
      createdOrg.id,
      validCertifications.map((item, index) => ({
        id: 0,
        orgId: createdOrg.id,
        name: normalizeLineText(item.name, {
          label: "Certification name",
          maxLength: 80,
          required: true,
          disallowUrl: true,
        }),
        abbr: item.abbr.trim()
          ? normalizeCode(item.abbr, {
              label: "Certification code",
              maxLength: 6,
              uppercase: true,
            })
          : item.name.trim().slice(0, 4).toUpperCase(),
        sortOrder: index,
      })),
      [],
    );
    savedCount += validCertifications.length;
  }

  if (validRoles.length > 0) {
    await saveOrganizationRoles(
      createdOrg.id,
      validRoles.map((item, index) => ({
        id: 0,
        orgId: createdOrg.id,
        name: normalizeLineText(item.name, {
          label: "Role name",
          maxLength: 80,
          required: true,
          disallowUrl: true,
        }),
        abbr: item.abbr.trim()
          ? normalizeCode(item.abbr, {
              label: "Role code",
              maxLength: 6,
              uppercase: true,
            })
          : item.name.trim().slice(0, 4).toUpperCase(),
        sortOrder: index,
      })),
      [],
    );
    savedCount += validRoles.length;
  }

  for (let index = 0; index < validCategories.length; index += 1) {
    const category = validCategories[index];
    const focusAreaId =
      (category.focusAreaId ? focusAreaIdMap.get(category.focusAreaId) : undefined) ?? null;
    const saved = await upsertShiftCategory({
      orgId: createdOrg.id,
      name: normalizeLineText(category.name, {
        label: "Shift name",
        maxLength: 50,
        required: true,
        disallowUrl: true,
      }),
      abbr: category.name.trim().slice(0, 6).toUpperCase(),
      startTime: category.startTime || null,
      endTime: category.endTime || null,
      sortOrder: index,
      color: DEFAULT_PREDEFINED_COLOR_BG,
      focusAreaId,
      breakMinutes: null,
    });
    shiftCategoryIdMap.set(category.id, saved.id);
  }
  savedCount += validCategories.length;

  for (let index = 0; index < validJobs.length; index += 1) {
    const job = validJobs[index];
    const departmentIds = job.departmentIds
      .map((id) => departmentIdMap.get(id))
      .filter((id): id is number => typeof id === "number");
    const focusAreaIds = job.focusAreaIds
      .map((id) => focusAreaIdMap.get(id))
      .filter((id): id is number => typeof id === "number");
    const applicableShiftIds = job.shiftCategoryIds
      .map((id) => shiftCategoryIdMap.get(id))
      .filter((id): id is number => typeof id === "number");
    await upsertJobDefinition({
      orgId: createdOrg.id,
      name: normalizeLineText(job.name.trim() || job.label.trim(), {
        label: "Job name",
        maxLength: 50,
        required: true,
        disallowUrl: true,
      }),
      abbr: job.label.trim()
        ? normalizeCode(job.label, {
            label: "Job abbreviation",
            maxLength: 6,
            required: true,
            uppercase: true,
          })
        : job.name.trim().slice(0, 4).toUpperCase(),
      showOnGrid: true,
      assignmentMode: "with_shift",
      eligibilityMode: "and",
      focusAreaIds,
      departmentIds,
      applicableShiftIds,
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "",
      border: "",
      text: "",
      shiftTimeOverrides: {},
      shiftColorOverrides: {},
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
        employmentType: "full_time",
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
    throw new Error(formatClientErrorMessage(json?.error, "We couldn't send that email."));
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
