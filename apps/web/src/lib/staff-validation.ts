import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRequiredStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  getOptionalUsPhoneError,
  normalizeOptionalStaffEmail,
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { z, type ZodError } from "zod";

type StaffFieldName =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "contactNotes"
  | "focusAreaIds"
  | "roleIds"
  | "departmentIds"
  | "deptAdminIds"
  | "certificationId"
  | "employmentType";

export type StaffFieldErrors = Partial<Record<StaffFieldName, string>>;

type StaffTextValidationInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  optionalEmail?: string;
  phone?: string;
  contactNotes?: string;
};

type StaffReferenceValidationInput = {
  focusAreaIds?: number[];
  roleIds?: number[];
  departmentIds?: number[];
  deptAdminIds?: number[];
  certificationId?: number | null;
  requireFocusArea?: boolean;
};

export function getStaffFieldErrors(input: StaffTextValidationInput): StaffFieldErrors {
  const fieldErrors: StaffFieldErrors = {};

  if (input.firstName !== undefined) {
    const error = getStaffNameError(input.firstName, "First name");
    if (error) {
      fieldErrors.firstName = error;
    }
  }

  if (input.lastName !== undefined) {
    const error = getStaffNameError(input.lastName, "Last name");
    if (error) {
      fieldErrors.lastName = error;
    }
  }

  if (input.email !== undefined) {
    const error = getRequiredStaffEmailError(input.email);
    if (error) {
      fieldErrors.email = error;
    }
  }

  if (input.optionalEmail !== undefined) {
    const normalized = input.optionalEmail.trim();
    if (normalized) {
      const error = getRequiredStaffEmailError(normalized);
      if (error) {
        fieldErrors.email = error;
      }
    }
  }

  if (input.phone !== undefined) {
    const error = getOptionalUsPhoneError(input.phone);
    if (error) {
      fieldErrors.phone = error;
    }
  }

  if (input.contactNotes !== undefined) {
    const error = getStaffNotesError(input.contactNotes);
    if (error) {
      fieldErrors.contactNotes = error;
    }
  }

  return fieldErrors;
}

export function normalizeStaffTextFields(input: StaffTextValidationInput): {
  firstName?: string;
  lastName?: string;
  email?: string;
  optionalEmail?: string;
  phone?: string;
  contactNotes?: string;
} {
  const fieldErrors = getStaffFieldErrors(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new Error(Object.values(fieldErrors)[0] ?? "Invalid input");
  }

  return {
    ...(input.firstName !== undefined ? { firstName: normalizeStaffName(input.firstName) } : {}),
    ...(input.lastName !== undefined ? { lastName: normalizeStaffName(input.lastName) } : {}),
    ...(input.email !== undefined ? { email: normalizeRequiredStaffEmail(input.email) } : {}),
    ...(input.optionalEmail !== undefined
      ? { optionalEmail: normalizeOptionalStaffEmail(input.optionalEmail) }
      : {}),
    ...(input.phone !== undefined ? { phone: normalizeOptionalUsPhone(input.phone) } : {}),
    ...(input.contactNotes !== undefined
      ? { contactNotes: normalizeStaffNotes(input.contactNotes) }
      : {}),
  };
}

export function getStaffFieldErrorsFromZod(error: ZodError): StaffFieldErrors {
  const fieldErrors: StaffFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as StaffFieldName] = issue.message;
    }
  }
  return fieldErrors;
}

export function buildStaffValidationErrorResponse(
  fieldErrors: StaffFieldErrors,
  fallbackMessage = "Invalid input",
) {
  const message = Object.values(fieldErrors)[0] ?? fallbackMessage;
  return Response.json(
    {
      error: message,
      fieldErrors,
    },
    { status: 400 },
  );
}

async function fetchActiveIds(
  serviceClient: SupabaseClient,
  table: "focus_areas" | "organization_roles" | "departments" | "certifications",
  orgId: string,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) {
    return new Set();
  }

  let query = serviceClient.from(table).select("id").eq("org_id", orgId).in("id", ids);
  if (table !== "certifications") {
    query = query.is("archived_at", null);
  } else {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.id as number));
}

export async function validateStaffOrgReferences(
  serviceClient: SupabaseClient,
  orgId: string,
  input: StaffReferenceValidationInput,
): Promise<StaffFieldErrors> {
  const fieldErrors: StaffFieldErrors = {};
  const focusAreaIds = input.focusAreaIds ? [...new Set(input.focusAreaIds)] : undefined;
  const roleIds = input.roleIds ? [...new Set(input.roleIds)] : undefined;
  const departmentIds = input.departmentIds ? [...new Set(input.departmentIds)] : undefined;
  const deptAdminIds = input.deptAdminIds ? [...new Set(input.deptAdminIds)] : undefined;

  if (input.requireFocusArea && focusAreaIds && focusAreaIds.length === 0) {
    fieldErrors.focusAreaIds = "Select at least one focus area";
  }

  const checks: Array<Promise<void>> = [];

  if (focusAreaIds) {
    checks.push(
      fetchActiveIds(serviceClient, "focus_areas", orgId, focusAreaIds).then((validIds) => {
        if (validIds.size !== focusAreaIds.length) {
          fieldErrors.focusAreaIds = "Select valid focus areas from this organization";
        }
      }),
    );
  }

  if (roleIds) {
    checks.push(
      fetchActiveIds(serviceClient, "organization_roles", orgId, roleIds).then((validIds) => {
        if (validIds.size !== roleIds.length) {
          fieldErrors.roleIds = "Select valid roles from this organization";
        }
      }),
    );
  }

  if (departmentIds) {
    checks.push(
      fetchActiveIds(serviceClient, "departments", orgId, departmentIds).then((validIds) => {
        if (validIds.size !== departmentIds.length) {
          fieldErrors.departmentIds = "Select valid departments from this organization";
        }
      }),
    );
  }

  if (input.certificationId != null) {
    checks.push(
      fetchActiveIds(serviceClient, "certifications", orgId, [input.certificationId]).then(
        (validIds) => {
          if (!validIds.has(input.certificationId!)) {
            fieldErrors.certificationId = "Select a valid certification from this organization";
          }
        },
      ),
    );
  }

  if (deptAdminIds) {
    if (departmentIds && deptAdminIds.some((id) => !departmentIds.includes(id))) {
      fieldErrors.deptAdminIds = "Department admins must belong to the selected departments";
    } else {
      checks.push(
        fetchActiveIds(serviceClient, "departments", orgId, deptAdminIds).then((validIds) => {
          if (validIds.size !== deptAdminIds.length) {
            fieldErrors.deptAdminIds =
              "Select valid department admin departments from this organization";
          }
        }),
      );
    }
  }

  await Promise.all(checks);
  return fieldErrors;
}

export const employeeEmploymentTypeSchema = z.enum(["full_time", "part_time"]);
