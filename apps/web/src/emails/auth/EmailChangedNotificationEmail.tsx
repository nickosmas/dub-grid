import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/**
 * Supabase: email_changed_notification.html — your account email address was
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
      logoUrl={logoUrl}
    />
  );
}

EmailChangedNotificationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default EmailChangedNotificationEmail;
