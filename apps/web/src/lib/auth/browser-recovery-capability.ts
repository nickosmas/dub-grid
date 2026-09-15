"use client";

const RECOVERY_CAPABILITY_KEY = "dubgrid:recovery-verified";

export function markBrowserRecoveryVerified(): void {
  window.sessionStorage.setItem(RECOVERY_CAPABILITY_KEY, "1");
}

export function consumeBrowserRecoveryVerification(): boolean {
  const verified = window.sessionStorage.getItem(RECOVERY_CAPABILITY_KEY) === "1";
  window.sessionStorage.removeItem(RECOVERY_CAPABILITY_KEY);
  return verified;
}

export function clearBrowserRecoveryVerification(): void {
  window.sessionStorage.removeItem(RECOVERY_CAPABILITY_KEY);
}
