import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/**
 * Supabase: email_changed_notification.html - your account email address was
 * changed. Distinct from EmailChangeEmail, which is the "confirm this change"
 * action email sent before the change takes effect.
 */
export function EmailChangedNotificationEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="Your email address was changed"
      body={
        <>
          Your account email address was changed from {SUPABASE.oldEmail} to {SUPABASE.newEmail}.
        </>
      }
      footer="If you made this change, no further action is required. If you didn't, contact your administrator or support@dubgrid.com immediately."
      logoUrl={logoUrl}
    />
  );
}

EmailChangedNotificationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default EmailChangedNotificationEmail;
