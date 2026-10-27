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

export function isAccountSuspendedMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_SUSPENDED_MESSAGE);
}

export function isAccountDisabledMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_DISABLED_MESSAGE);
}
