import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: mfa_factor_enrolled_notification.html — a new sign-in verification method was added. */
export function MfaFactorEnrolledEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="A new sign-in verification method was added"
      body={<>The {SUPABASE.factorType} verification method was added to your account.</>}
      logoUrl={logoUrl}
    />
  );
}

MfaFactorEnrolledEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MfaFactorEnrolledEmail;
