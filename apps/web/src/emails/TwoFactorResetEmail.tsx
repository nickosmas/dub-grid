import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type TwoFactorResetEmailProps = {
  logoUrl: string;
};

export const TWO_FACTOR_RESET_SUBJECT = "Your DubGrid two-factor sign-in was reset";

/**
 * Tells a person that DubGrid support reset their two-factor sign-in. It names
 * no one at DubGrid and carries no reason, since the address may not be theirs.
 */
export function TwoFactorResetEmail({ logoUrl }: TwoFactorResetEmailProps) {
  const heading = "Your two-factor sign-in was reset";
  return (
    <EmailLayout logoUrl={logoUrl} preview={heading}>
      <Text style={styles.heading}>{heading}</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>
        DubGrid support removed the authenticator app from your account and signed you out
        everywhere. The next time you sign in with your password, you&apos;ll set up an
        authenticator app again before you continue.
      </Text>
      <Text style={styles.paragraph}>
        If you didn&apos;t ask for this, contact support@dubgrid.com right away.
      </Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

TwoFactorResetEmail.PreviewProps = {
  logoUrl: PREVIEW_LOGO_URL,
} satisfies TwoFactorResetEmailProps;

export default TwoFactorResetEmail;
