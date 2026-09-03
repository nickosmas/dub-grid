import * as React from "react";
import { SecurityNotificationEmail } from "./SecurityNotificationEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: password_changed_notification.html — your password was changed. */
export function PasswordChangedEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <SecurityNotificationEmail
      heading="Your password was changed"
      body="Your account password was recently changed."
      footer={
        <>
          If this was you, there&apos;s nothing else to do. If it wasn&apos;t, contact your
          administrator immediately, or reach support@dubgrid.com — this address doesn&apos;t accept
          replies.
        </>
      }
      logoUrl={logoUrl}
    />
  );
}

PasswordChangedEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default PasswordChangedEmail;
