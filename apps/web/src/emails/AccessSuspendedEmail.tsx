import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type AccessSuspendedEmailProps = {
  logoUrl: string;
  organizationName: string;
};

export function accessSuspendedSubject(organizationName: string): string {
  return `Your access to ${organizationName} is suspended`;
}

/**
 * Sent to a suspended person's own address (51d): they can't sign in to read
 * an alert. It names the organization and nobody in it, and says only their
 * state.
 */
export function AccessSuspendedEmail({ logoUrl, organizationName }: AccessSuspendedEmailProps) {
  const subject = accessSuspendedSubject(organizationName);
  return (
    <EmailLayout logoUrl={logoUrl} preview={subject}>
      <Text style={styles.heading}>{subject}</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>You can&apos;t sign in to {organizationName} right now.</Text>
      <Text style={styles.paragraph}>If you have questions, contact your administrator.</Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

AccessSuspendedEmail.PreviewProps = {
  logoUrl: PREVIEW_LOGO_URL,
  organizationName: "Calm Haven",
} satisfies AccessSuspendedEmailProps;

export default AccessSuspendedEmail;
