import * as React from "react";
import { Section, Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "../components/EmailSalutation";
import { emailTheme, fontStack, styles } from "../components/theme";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: reauthentication.html - shows a one-time code to confirm identity. */
export function ReauthenticationEmail({ logoUrl = SUPABASE.siteUrl }: { logoUrl?: string } = {}) {
  return (
    <EmailLayout logoUrl={logoUrl} preview="Confirm your identity">
      <Text style={styles.heading}>Confirm your identity</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>
        Enter this code to confirm a change to your DubGrid account. It expires in 1 hour.
      </Text>
      <Section style={{ textAlign: "center", margin: "0 0 32px" }}>
        <Text
          style={{
            display: "inline-block",
            fontFamily: fontStack,
            fontSize: "32px",
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: emailTheme.brand,
            backgroundColor: emailTheme.pageBg,
            border: `1px solid ${emailTheme.border}`,
            borderRadius: "8px",
            padding: "16px 28px",
            margin: 0,
          }}
        >
          {SUPABASE.token}
        </Text>
      </Section>
      <Text style={styles.paragraph}>
        If you didn&apos;t request this code, someone may know your password. Reset it from the
        DubGrid sign-in page and review your active sessions in your profile.
      </Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

ReauthenticationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default ReauthenticationEmail;
