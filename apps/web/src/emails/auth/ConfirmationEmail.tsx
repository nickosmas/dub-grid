import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: confirmation.html - verify email after signup. */
export function ConfirmationEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="Confirm your email"
      intro="Thanks for signing up! Confirm your email address below to finish setting up your account."
      ctaLabel="Confirm email"
      footer="If you didn't create an account, you can safely ignore this email."
      logoUrl={logoUrl}
    />
  );
}

ConfirmationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default ConfirmationEmail;
