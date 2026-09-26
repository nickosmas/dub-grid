import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
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
    <EmailLayout logoUrl={logoUrl} preview="Your DubGrid account was deleted">
      <Text style={styles.heading}>Your DubGrid account was deleted</Text>
      <Text style={styles.paragraph}>
        The DubGrid account that used this email address has been deleted. It can no longer sign in,
        and every device it was signed in on has been signed out.
      </Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        If you didn&apos;t ask for this, contact support@dubgrid.com right away.
      </Text>
    </EmailLayout>
  );
}

AccountDeletedEmail.PreviewProps = {
  logoUrl: PREVIEW_LOGO_URL,
} satisfies AccountDeletedEmailProps;

export default AccountDeletedEmail;
