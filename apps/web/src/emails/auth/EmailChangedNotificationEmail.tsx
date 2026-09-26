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
          The email for your DubGrid account was changed from {SUPABASE.oldEmail} to{" "}
          {SUPABASE.newEmail}.
        </>
      }
      footer="If it was you, you don't need to do anything. If it wasn't you, contact support@dubgrid.com right away, since whoever made the change can now sign in with the new address."
      logoUrl={logoUrl}
    />
  );
}

EmailChangedNotificationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default EmailChangedNotificationEmail;
