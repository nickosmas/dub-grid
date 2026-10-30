import { insertEmployees } from "@/features/employees/client";
import { createGridmasterOrganizationSetup } from "@/features/gridmaster/client";
import {
  createOrganizationInvitation,
  saveOrganizationSettingsWithRecovery,
} from "@/features/organization/client";
import {
  saveCertifications,
  saveDepartments,
  saveFocusAreas,
  saveJobDefinitions,
  saveOrganizationRoles,
  saveShiftCategories,
  type SettingsBatchItemResult,
} from "@/features/settings/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { DEFAULT_PREDEFINED_COLOR_BG } from "@/lib/colors";
import { normalizeCode, normalizeLineText } from "@/lib/form-validation";
import { getCompactNamedItemLabel } from "@/lib/utils";
import type { AssignableOrganizationRole, Organization } from "@/types";
import type {
  CreatedEmployee,
  DeptRow,
  EmployeeRow,
  FocusAreaRow,
  InvitationRow,
  JobRow,
  NamedItemRow,
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
  | { kind: "invited"; displayName: string }
  | { kind: "invite-error"; displayName: string; message: string };

export async function createOrganizationSetup(
  input: CreateOrganizationSetupInput,
  accessToken?: string,
): Promise<{
  org: Organization;
  superAdmin: SuperAdminSetupResult;
}> {
  return createGridmasterOrganizationSetup(input, accessToken);
}

/** The saved items in order, or an error naming how many didn't save. */
function requireAllSaved<T>(results: SettingsBatchItemResult<T>[], noun: string): T[] {
  const saved = results.flatMap((result) => (result.ok ? [result.item] : []));
  if (saved.length < results.length) {
    throw new Error(
      `We couldn't save ${results.length - saved.length} of ${results.length} ${noun}. Try again.`,
    );
  }
  return saved;
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
}: SaveOrganizationConfigInput): Promise<{
  savedCount: number;
  /** Each saved focus area's setup row id, to its id in the organization. */
  focusAreaIds: Map<string, number>;
}> {
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
    await saveOrganizationSettingsWithRecovery({
      baseline: createdOrg,
      input: {
        orgId: createdOrg.id,
        expectedUpdatedAt: createdOrg.updatedAt ?? new Date(0).toISOString(),
        shiftDisplayMode,
      },
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

  if (validFocusAreas.length > 0) {
    const { upserts } = await saveFocusAreas(
      createdOrg.id,
      validFocusAreas.map((focusArea, index) => ({
        orgId: createdOrg.id,
        departmentId:
          (focusArea.departmentId ? departmentIdMap.get(focusArea.departmentId) : undefined) ??
          null,
        name: normalizeLineText(focusArea.name, {
          label: "Focus area name",
          maxLength: 80,
          required: true,
          disallowUrl: true,
        }),
        color: null,
        sortOrder: index,
      })),
      [],
    );
    requireAllSaved(upserts, "focus areas").forEach((saved, index) => {
      focusAreaIdMap.set(validFocusAreas[index].id, saved.id);
    });
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
          : getCompactNamedItemLabel(item),
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
          : getCompactNamedItemLabel(item),
        sortOrder: index,
      })),
      [],
    );
    savedCount += validRoles.length;
  }

  if (validCategories.length > 0) {
    const results = await saveShiftCategories(
      createdOrg.id,
      validCategories.map((category, index) => ({
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
        focusAreaId:
          (category.focusAreaId ? focusAreaIdMap.get(category.focusAreaId) : undefined) ?? null,
        breakMinutes: null,
      })),
    );
    requireAllSaved(results, "shifts").forEach((saved, index) => {
      shiftCategoryIdMap.set(validCategories[index].id, saved.id);
    });
  }
  savedCount += validCategories.length;

  if (validJobs.length > 0) {
    const results = await saveJobDefinitions(
      createdOrg.id,
      validJobs.map((job, index) => {
        const departmentIds = job.departmentIds
          .map((id) => departmentIdMap.get(id))
          .filter((id): id is number => typeof id === "number");
        const focusAreaIds = job.focusAreaIds
          .map((id) => focusAreaIdMap.get(id))
          .filter((id): id is number => typeof id === "number");
        const applicableShiftIds = job.shiftCategoryIds
          .map((id) => shiftCategoryIdMap.get(id))
          .filter((id): id is number => typeof id === "number");
        return {
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
        };
      }),
    );
    requireAllSaved(results, "jobs");
  }
  savedCount += validJobs.length;

  return { savedCount, focusAreaIds: focusAreaIdMap };
}

/**
 * Everyone needs a focus area to be on the schedule, so each person takes the
 * one picked on their row, or the first saved when none was picked.
 */
export async function createOrganizationEmployees(
  createdOrg: Organization,
  employeeRows: EmployeeRow[],
  focusAreaIds: Map<string, number>,
): Promise<CreatedEmployee[]> {
  const validRows = employeeRows.filter((row) => row.firstName.trim());
  if (validRows.length === 0) return [];
  const firstFocusAreaId = focusAreaIds.values().next().value;
  if (firstFocusAreaId === undefined) {
    throw new Error("Add a focus area in the setup step before adding staff.");
  }

  const { employees, failed } = await insertEmployees(
    validRows.map((row) => ({
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      employmentType: "full_time" as const,
      email: row.email.trim(),
      phone: row.phone.trim(),
      certificationId: null,
      roleIds: [],
      focusAreaIds: [
        (row.focusAreaId ? focusAreaIds.get(row.focusAreaId) : undefined) ?? firstFocusAreaId,
      ],
      contactNotes: "",
      status: "active" as const,
      statusChangedAt: null,
      statusNote: "",
      userId: null,
      departmentIds: [],
      deptAdminIds: [],
      version: 0,
    })),
    createdOrg.id,
  );
  if (failed.length > 0) {
    throw new Error(
      `We couldn't add ${failed.length} of ${validRows.length} people. ${failed[0].error}`,
    );
  }

  return employees.map((employee): CreatedEmployee => ({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
  }));
}

export async function sendOrganizationInvitations(
  createdOrg: Organization,
  invitationRows: InvitationRow[],
  accessToken?: string,
): Promise<{ sentCount: number; failCount: number }> {
  let sentCount = 0;
  let failCount = 0;

  for (const invitationRow of invitationRows) {
    // Counted as sent only once its email has gone out: the create call sends
    // it, and a failed send leaves no invitation behind.
    try {
      await createOrganizationInvitation(
        {
          email: invitationRow.email,
          role: invitationRow.role as AssignableOrganizationRole,
          orgId: createdOrg.id,
          employeeId: invitationRow.employeeId,
        },
        accessToken,
      );
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
