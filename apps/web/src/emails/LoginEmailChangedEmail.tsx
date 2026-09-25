import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type LoginEmailChangedEmailProps = {
  orgName: string;
  /**
   * The previous address is the member's own verified sign-in, so it may learn
   * where the sign-in went. The new address was typed by an administrator and
   * may be a stranger's, so it learns nothing about the previous one.
   */
  recipient: "previous" | "new";
  newEmail: string;
  logoUrl: string;
};

/** Sent to both addresses when an administrator changes someone's sign-in email. */
export function LoginEmailChangedEmail({
  orgName,
  recipient,
  newEmail,
  logoUrl,
}: LoginEmailChangedEmailProps) {
  const heading =
    recipient === "previous"
      ? "Your sign-in email was changed"
      : "This address now signs in to DubGrid";
  return (
    <EmailLayout logoUrl={logoUrl} preview={heading}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.paragraph}>
        {recipient === "previous" ? (
          <>
            An administrator at <strong>{orgName}</strong> changed the email you use to sign in to
            DubGrid to <strong>{newEmail}</strong>. You&apos;ve been signed out on your devices.
            Sign in again with the new address.
          </>
        ) : (
          <>
            An administrator at <strong>{orgName}</strong> set this address as the email for a
            DubGrid sign-in. Use it the next time you sign in.
          </>
        )}
      </Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        {recipient === "previous"
          ? `If you didn't expect this, contact ${orgName} or support@dubgrid.com right away.`
          : `If you don't work with ${orgName}, contact support@dubgrid.com.`}
      </Text>
    </EmailLayout>
  );
}

LoginEmailChangedEmail.PreviewProps = {
  orgName: "Acme Health",
  recipient: "previous",
  newEmail: "new.address@example.com",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies LoginEmailChangedEmailProps;

export default LoginEmailChangedEmail;
