import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL, RECOVERY_VERIFICATION_URL } from "./placeholders";

/** Supabase: recovery.html - password reset. */
export function RecoveryEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="Reset your password"
      intro="We got a request to reset the password for your DubGrid sign-in. Use the button below to choose a new one. The link and code expire in 1 hour."
      ctaLabel="Reset password"
      actionHref={RECOVERY_VERIFICATION_URL}
      // The mobile app resets in-app rather than opening this link, so the same
      // email has to carry a code it can accept.
      code={{ label: "Or enter this code in the DubGrid app." }}
      footer="If you didn't ask to reset your password, you can safely ignore this email. Your password won't change."
      logoUrl={logoUrl}
    />
  );
}

RecoveryEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default RecoveryEmail;
