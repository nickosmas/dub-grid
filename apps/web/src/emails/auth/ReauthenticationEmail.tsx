import * as React from "react";
import { Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { emailTheme, fontStack, styles } from "../components/theme";
import { SUPABASE, PREVIEW_LOGO_URL } from "./placeholders";

/** Supabase: reauthentication.html - shows a one-time code to confirm identity. */
export function ReauthenticationEmail({ logoUrl = SUPABASE.siteUrl }: { logoUrl?: string } = {}) {
  return (
    <EmailLayout logoUrl={logoUrl} preview="Confirm your identity">
      <Text style={{ ...styles.heading, textAlign: "center" }}>Confirm your identity</Text>
      <Text style={{ ...styles.paragraph, textAlign: "center", fontSize: "15px" }}>
        Enter this code to confirm a sensitive change to your DubGrid sign-in. It expires in 1 hour.
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
      <Hr style={styles.divider} />
      <Text style={{ ...styles.fine, textAlign: "center" }}>
        If you didn&apos;t request this code, someone may know your password. Reset it from the
        DubGrid sign-in page and review your active sessions in your profile.
      </Text>
    </EmailLayout>
  );
}

ReauthenticationEmail.PreviewProps = { logoUrl: PREVIEW_LOGO_URL };

export default ReauthenticationEmail;
