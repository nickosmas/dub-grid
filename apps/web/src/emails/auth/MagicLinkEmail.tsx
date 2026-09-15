import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";
import { ACTION_SIGN_IN } from "@/lib/action-copy";

/** Supabase: magic_link.html — passwordless sign-in. */
export function MagicLinkEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="Sign in to DubGrid"
      intro="Click the button below to sign in to your account. No password needed."
      ctaLabel={ACTION_SIGN_IN}
      footer="If you didn't request this link, you can safely ignore this email."
      logoUrl={logoUrl}
    />
  );
}

MagicLinkEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default MagicLinkEmail;
