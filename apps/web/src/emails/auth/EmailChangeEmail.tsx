import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: email_change.html - confirm an email address change. */
export function EmailChangeEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="Confirm your email change"
      intro="Click the button below to confirm the new email address for your DubGrid sign-in. The link expires in 1 hour."
      ctaLabel="Confirm change"
      footer="If you didn't request this change, don't confirm it. Contact support@dubgrid.com if you think someone else is using your sign-in."
      logoUrl={logoUrl}
    />
  );
}

EmailChangeEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default EmailChangeEmail;
