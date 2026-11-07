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
  "Your access to the app is suspended, so you can't sign in right now. Contact your administrator for help.";

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

/**
 * What a suspended person sees at sign-in, naming the organization when the
 * caller knows it and the day they get access back when there is one.
 */
export function accessSuspendedBody(until?: string | null, orgName?: string | null): string {
  const day = until ? new Date(`${until}T00:00:00Z`) : null;
  const dated = day !== null && !Number.isNaN(day.getTime());
  if (!dated && !orgName) return ACCESS_SUSPENDED_BODY;
  const access = `Your access to ${orgName ?? "the app"} is suspended`;
  const help = "Contact your administrator for help.";
  return dated
    ? `${access}. You can sign in again on ${UNTIL_DAY.format(day)}. ${help}`
    : `${access}, so you can't sign in right now. ${help}`;
}

export function isAccountSuspendedMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_SUSPENDED_MESSAGE);
}

export function isAccountDisabledMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_DISABLED_MESSAGE);
}
