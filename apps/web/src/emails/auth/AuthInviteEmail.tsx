import * as React from "react";
import { AuthActionEmail } from "./AuthActionEmail";
import { PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: invite.html — Supabase-issued organization invite. */
export function AuthInviteEmail({ logoUrl }: { logoUrl?: string } = {}) {
  return (
    <AuthActionEmail
      heading="You're invited to DubGrid"
      intro="You've been invited to join an organization on DubGrid. Click the button below to accept and set up your account."
      ctaLabel="Accept invitation"
      footer="If you weren't expecting this invitation, you can safely ignore this email."
      logoUrl={logoUrl}
    />
  );
}

AuthInviteEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default AuthInviteEmail;
