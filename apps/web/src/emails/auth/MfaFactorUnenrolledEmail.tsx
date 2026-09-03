import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: mfa_factor_unenrolled_notification.html — a sign-in verification method was removed. */
export function MfaFactorUnenrolledEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="A sign-in verification method was removed"
      body={<>The {SUPABASE.factorType} verification method was removed from your account.</>}
      logoUrl={logoUrl}
    />
  );
}

MfaFactorUnenrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorUnenrolledEmail;
