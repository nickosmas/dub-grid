import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: recovery.html — password reset. */
export function RecoveryEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="Reset your password"
      intro="Click the button below to choose a new password for your account."
      ctaLabel="Reset password"
      // The mobile app resets in-app rather than opening this link, so the same
      // email has to carry a code it can accept.
      code={{ label: "Or enter this code in the DubGrid app." }}
      footer="If you didn't request a password reset, you can safely ignore this email."
      logoUrl={logoUrl}
    />
  );
}

RecoveryEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default RecoveryEmail;
