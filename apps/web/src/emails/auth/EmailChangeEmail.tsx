import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: email_change.html — confirm an email address change. */
export function EmailChangeEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="Confirm your email change"
      intro="Click the button below to confirm the new email address for your account."
      ctaLabel="Confirm change"
      footer="If you didn't request this change, please contact your administrator."
      logoUrl={logoUrl}
    />
  );
}

EmailChangeEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default EmailChangeEmail;
