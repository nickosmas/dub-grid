import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/**
 * Supabase: mfa_factor_unenrolled_notification.html — a sign-in verification
 * method was removed. The factor name is spelled out rather than interpolating
 * {{ .FactorType }}, since this app only ever enrolls TOTP (phone MFA is off).
 */
export function MfaFactorUnenrolledEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="A sign-in verification method was removed"
      body="The TOTP (Time-based One-time Password) verification method was removed from your account."
      footer={
        <>
          If you removed this yourself, there&apos;s nothing else to do. Removing it makes your
          account accessible with just a password, so if you didn&apos;t do this, contact your
          administrator immediately, or reach support@dubgrid.com — this address doesn&apos;t accept
          replies.
        </>
      }
      logoUrl={logoUrl}
    />
  );
}

MfaFactorUnenrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorUnenrolledEmail;
