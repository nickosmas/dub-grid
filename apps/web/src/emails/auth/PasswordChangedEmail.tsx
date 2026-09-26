import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: password_changed_notification.html - your password was changed. */
export function PasswordChangedEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="Your password was changed"
      body="The password for your DubGrid account was changed."
      footer="If it was you, you don't need to do anything. If it wasn't you, reset your password from the DubGrid sign-in page right away, then review your active sessions in your profile. Contact support@dubgrid.com if you can't sign in."
      logoUrl={logoUrl}
    />
  );
}

PasswordChangedEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default PasswordChangedEmail;
