export const ACCOUNT_DISABLED_CODE = "ACCOUNT_DISABLED";

export const ACCOUNT_DISABLED_MESSAGE =
  "Your account has been disabled. Contact your organization admin.";

export const ACCOUNT_SUSPENDED_CODE = "ACCOUNT_SUSPENDED";

/** The JWT hook's sentinel for a suspended employee (migration 101); keep it stable. */
export const ACCOUNT_SUSPENDED_MESSAGE =
  "Your access has been suspended. Contact your organization admin.";

export const ACCESS_SUSPENDED_TITLE = "Access suspended";

/** What a suspended person sees at sign-in: their state only, and who can help. */
export const ACCESS_SUSPENDED_BODY =
  "Your organization has suspended your access to the app. Contact an administrator there if you have questions.";

/**
 * The hook (migration 105) adds a suspension's end to its sentinel as
 * " Until YYYY-MM-DD."; this reads it back, or null without one.
 */
export function suspendedUntilFromMessage(message: string | null | undefined): string | null {
  if (!isAccountSuspendedMessage(message)) return null;
  return /Until (\d{4}-\d{2}-\d{2})\./.exec(message as string)?.[1] ?? null;
}

const UNTIL_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** What a suspended person sees at sign-in, with the day they get access back when there is one. */
export function accessSuspendedBody(until?: string | null): string {
  const day = until ? new Date(`${until}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime())) return ACCESS_SUSPENDED_BODY;
  return `Your organization has suspended your access to the app until ${UNTIL_DAY.format(day)}. Contact an administrator there if you have questions.`;
}

export function isAccountSuspendedMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_SUSPENDED_MESSAGE);
}

export function isAccountDisabledMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_DISABLED_MESSAGE);
}
