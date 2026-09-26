import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type AccountDeletedEmailProps = {
  logoUrl: string;
};

/**
 * Sent to a deleted account's address once the deletion has gone through.
 * It names no person and no organization: the address may belong to someone
 * other than the account holder, and the deletion may have been approved by
 * an organization the reader has never heard of.
 */
export function AccountDeletedEmail({ logoUrl }: AccountDeletedEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview="Your DubGrid account has been deleted">
      <Text style={styles.heading}>Your DubGrid account has been deleted</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>
        The DubGrid account for this email address has been deleted. It can no longer be used to
        sign in, and we&apos;ve signed it out on every device.
      </Text>
      <Text style={styles.paragraph}>
        If you didn&apos;t ask for this, contact support@dubgrid.com right away and we&apos;ll help.
      </Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

AccountDeletedEmail.PreviewProps = {
  logoUrl: PREVIEW_LOGO_URL,
} satisfies AccountDeletedEmailProps;

export default AccountDeletedEmail;
