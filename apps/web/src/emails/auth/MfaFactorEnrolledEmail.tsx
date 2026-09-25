import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/**
 * Supabase: mfa_factor_enrolled_notification.html - a new sign-in
 * verification method was added. The factor name is spelled out rather than
 * interpolating {{ .FactorType }}, since this app only ever enrolls TOTP
 * (phone MFA is off).
 */
export function MfaFactorEnrolledEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="A new sign-in verification method was added"
      body="An authenticator app was added as a verification method for your DubGrid sign-in."
      footer="If this was you, there's nothing to do. If it wasn't, someone may know your password: reset it from the DubGrid sign-in page, then review your active sessions and verification methods in your profile. Contact support@dubgrid.com if you can't sign in."
      logoUrl={logoUrl}
    />
  );
}

MfaFactorEnrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorEnrolledEmail;
