import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "../components/EmailSalutation";
import { EmailCode } from "../components/EmailCard";
import { text } from "../components/theme";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: reauthentication.html - shows a one-time code to confirm identity. */
export function ReauthenticationEmail({ logoUrl = SUPABASE.siteUrl }: { logoUrl?: string } = {}) {
  return (
    <EmailLayout logoUrl={logoUrl} preview="Confirm your identity">
      <Text {...text.heading}>Confirm your identity</Text>
      <EmailGreeting />
      <Text {...text.paragraph}>
        Enter this code to confirm a change to your DubGrid account. It expires in 15 minutes.
      </Text>
      <EmailCode label="Your code" code={SUPABASE.token} />
      <Text {...text.paragraph}>
        If you didn&apos;t request this code, someone may know your password. Reset it from the
        DubGrid sign-in page and review your active sessions in your profile.
      </Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

ReauthenticationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default ReauthenticationEmail;
