const CLIENT_FRIENDLY_ERROR_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
}> = [
  {
    pattern: /invalid login credentials|invalid email or password/i,
    message: "Check your email and password and try again.",
  },
  {
    pattern: /jwt expired|refresh token not found|invalid refresh token|invalid session|unauthenticated|session expired/i,
    message: "Your session has expired. Please log in again.",
  },
  {
    pattern: /unauthorized|forbidden|not authorized|permission denied/i,
    message: "You don't have permission to do that.",
  },
  {
    pattern: /failed to fetch|network request failed|load failed|connection refused|network connection/i,
    message: "We're having trouble connecting. Please try again.",
  },
];

const TECHNICAL_ERROR_PATTERNS = [
  /PGRST\d*/i,
  /PostgREST/i,
  /Supabase/i,
  /row-level security|RLS/i,
  /SQL|database|schema|relation|column|constraint|foreign key|duplicate key/i,
  /RPC|function .* does not exist/i,
  /JWT/i,
  /UUID/i,
  /\b(org_id|user_id|employee_id|resource_id|metadata|payload)\b/i,
  /JSON|non-JSON/i,
  /service role|environment variable|env var/i,
  /HTTP\s+\d{3}/i,
] as const;

export function extractRawErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : null;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    return message.length > 0 ? message : null;
  }

  if (typeof error === "string") {
    const message = error.trim();
    return message.length > 0 ? message : null;
  }

  return null;
}

export function formatClientErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const rawMessage = extractRawErrorMessage(error);
  if (!rawMessage) return fallback;

  const matchedMessage = CLIENT_FRIENDLY_ERROR_PATTERNS.find(({ pattern }) =>
    pattern.test(rawMessage),
  );
  if (matchedMessage) return matchedMessage.message;

  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(rawMessage))) {
    return fallback;
  }

  return rawMessage;
}

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

export function formatOrganizationRoleLabel(
  role: string | null | undefined,
): string {
  if (!role) return "User";
  return ORGANIZATION_ROLE_LABELS[role] ?? formatClientLabel(role);
}

const SHIFT_REQUEST_TYPE_LABELS: Record<string, string> = {
  calloff: "Call-off",
  pickup: "Pickup",
  swap: "Swap",
};

export function formatShiftRequestTypeLabel(
  type: string | null | undefined,
): string {
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

export function formatShiftRequestStatusLabel(
  status: string | null | undefined,
): string {
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

export function formatBillingStatusLabel(
  status: string | null | undefined,
): string {
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
