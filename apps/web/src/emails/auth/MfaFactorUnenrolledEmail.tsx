import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/**
 * Supabase: mfa_factor_unenrolled_notification.html - a sign-in verification
 * method was removed. The factor name is spelled out rather than interpolating
 * {{ .FactorType }}, since this app only ever enrolls TOTP (phone MFA is off).
 */
export function MfaFactorUnenrolledEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="A sign-in verification method was removed"
      body="An authenticator app was removed as a verification method for your DubGrid account."
      footer="If it was you, you don't need to do anything. If it wasn't you, reset your password from the DubGrid sign-in page right away, turn two-factor authentication back on, and review your active sessions in your profile. Contact support@dubgrid.com if you can't sign in."
      logoUrl={logoUrl}
    />
  );
}

MfaFactorUnenrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorUnenrolledEmail;
