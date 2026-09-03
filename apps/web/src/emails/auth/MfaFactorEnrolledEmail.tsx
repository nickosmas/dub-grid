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
      body="The TOTP (Time-based One-time Password) verification method was added to your account."
      footer="If you made this change, no further action is required. If you didn't, contact your administrator or support@dubgrid.com immediately."
      logoUrl={logoUrl}
    />
  );
}

MfaFactorEnrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorEnrolledEmail;
