import type { NameMismatchDetails, NameMismatchResponseBody } from "@/types";

type NameParts = {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
};

function normalizeNamePart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeDisplayName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function hasCompleteName(name: NameParts): boolean {
  return (
    normalizeNamePart(name.firstName).length > 0 && normalizeNamePart(name.lastName).length > 0
  );
}

export function namesMatch(employeeName: NameParts, accountName: NameParts): boolean {
  if (!hasCompleteName(employeeName) || !hasCompleteName(accountName)) return false;
  return (
    normalizeNamePart(employeeName.firstName) === normalizeNamePart(accountName.firstName) &&
    normalizeNamePart(employeeName.lastName) === normalizeNamePart(accountName.lastName)
  );
}

export function createNameMismatchDetails(input: NameMismatchDetails): NameMismatchDetails {
  return {
    employeeId: input.employeeId,
    userId: input.userId,
    employeeFirstName: normalizeDisplayName(input.employeeFirstName),
    employeeLastName: normalizeDisplayName(input.employeeLastName),
    accountFirstName: normalizeDisplayName(input.accountFirstName),
    accountLastName: normalizeDisplayName(input.accountLastName),
  };
}

export class NameMismatchError extends Error {
  readonly code = "NAME_MISMATCH" as const;

  constructor(
    public readonly details: NameMismatchDetails,
    message = "The user account name does not match the employee record.",
  ) {
    super(message);
    this.name = "NameMismatchError";
  }
}

export function parseNameMismatchResponse(payload: unknown): NameMismatchError | null {
  if (!payload || typeof payload !== "object") return null;
  const code = (payload as { code?: unknown }).code;
  const details = (payload as { details?: unknown }).details;
  if (code !== "NAME_MISMATCH" || !details || typeof details !== "object") return null;

  const typedDetails = details as Partial<NameMismatchDetails>;
  if (
    typeof typedDetails.userId !== "string" ||
    typeof typedDetails.employeeFirstName !== "string" ||
    typeof typedDetails.employeeLastName !== "string" ||
    typeof typedDetails.accountFirstName !== "string" ||
    typeof typedDetails.accountLastName !== "string"
  ) {
    return null;
  }

  const message =
    typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : undefined;

  return new NameMismatchError(
    createNameMismatchDetails({
      employeeId: typeof typedDetails.employeeId === "string" ? typedDetails.employeeId : null,
      userId: typedDetails.userId,
      employeeFirstName: typedDetails.employeeFirstName,
      employeeLastName: typedDetails.employeeLastName,
      accountFirstName: typedDetails.accountFirstName,
      accountLastName: typedDetails.accountLastName,
    }),
    message,
  );
}

export function createNameMismatchResponseBody(
  details: NameMismatchDetails,
  error = "The user account name does not match the employee record.",
): NameMismatchResponseBody {
  return {
    code: "NAME_MISMATCH",
    error,
    details: createNameMismatchDetails(details),
  };
}
