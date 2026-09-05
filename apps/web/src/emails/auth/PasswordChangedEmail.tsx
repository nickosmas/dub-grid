import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: password_changed_notification.html - your password was changed. */
export function PasswordChangedEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="Your password was changed"
      body="Your account password was recently changed."
      footer="If you made this change, no further action is required. If you didn't, contact your administrator or support@dubgrid.com immediately."
      logoUrl={logoUrl}
    />
  );
}

PasswordChangedEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default PasswordChangedEmail;
