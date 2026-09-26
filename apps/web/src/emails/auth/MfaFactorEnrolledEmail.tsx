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
      // A reset would ask for the new authenticator, which may be someone
      // else's, so the only useful step for the owner is support.
      footer="If it was you, you don't need to do anything. If it wasn't you, contact support@dubgrid.com right away, since someone else may be using your DubGrid sign-in."
      logoUrl={logoUrl}
    />
  );
}

MfaFactorEnrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorEnrolledEmail;
