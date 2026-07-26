import {
  formatClientErrorMessage as sharedFormatClientErrorMessage,
  getErrorMessage as sharedGetErrorMessage,
  isSessionExpiredError as sharedIsSessionExpiredError,
} from "@dubgrid/client-errors";

export const formatClientErrorMessage = sharedFormatClientErrorMessage;
export const extractRawErrorMessage = sharedGetErrorMessage;
export const isSessionExpiredError = sharedIsSessionExpiredError;

export function formatClientLabel(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "Unknown";

  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  user: "User",
};

export function formatOrganizationRoleLabel(role: string | null | undefined): string {
  if (!role) return "User";
  return ORGANIZATION_ROLE_LABELS[role] ?? formatClientLabel(role);
}

const SHIFT_REQUEST_TYPE_LABELS: Record<string, string> = {
  calloff: "Call-off",
  pickup: "Pickup",
  swap: "Swap",
};

export function formatShiftRequestTypeLabel(type: string | null | undefined): string {
  if (!type) return "Request";
  return SHIFT_REQUEST_TYPE_LABELS[type] ?? formatClientLabel(type);
}

const SHIFT_REQUEST_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  cancelled: "Cancelled",
  canceled: "Canceled",
  open: "Open",
  pending_approval: "Awaiting approval",
  rejected: "Rejected",
};

export function formatShiftRequestStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return SHIFT_REQUEST_STATUS_LABELS[status] ?? formatClientLabel(status);
}

const BILLING_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  canceled: "Canceled",
  incomplete: "Setup incomplete",
  incomplete_expired: "Setup expired",
  past_due: "Past due",
  paused: "Paused",
  trial_grace: "Trial grace period",
  trial_ending_soon: "Trial ending soon",
  trial_expired: "Trial expired",
  trialing: "Trial active",
  unpaid: "Unpaid",
};

export function formatBillingStatusLabel(status: string | null | undefined): string {
  if (!status) return "Not connected";
  return BILLING_STATUS_LABELS[status] ?? formatClientLabel(status);
}

export function formatDateTimeLabel(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
