export const ACCOUNT_DISABLED_CODE = "ACCOUNT_DISABLED";

export const ACCOUNT_DISABLED_MESSAGE =
  "Your account has been disabled. Contact your organization admin.";

export function isAccountDisabledMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(ACCOUNT_DISABLED_MESSAGE);
}
