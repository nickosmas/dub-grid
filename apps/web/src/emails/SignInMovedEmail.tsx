import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { text, PREVIEW_LOGO_URL } from "./components/theme";

export type SignInMovedEmailProps = {
  orgName: string;
  logoUrl: string;
};

/**
 * Sent to the old address when an organization moves a staff record to a new
 * one. It never prints the new address: if the move was a mistake or abuse, the
 * reader is the person it was done to, and the address is not theirs to learn.
 */
export function SignInMovedEmail({ orgName, logoUrl }: SignInMovedEmailProps) {
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={`Your access to ${orgName} changed`}
      organization={orgName}
    >
      <Text {...text.heading}>Your access to {orgName} changed</Text>
      <EmailGreeting />
      <Text {...text.paragraph}>
        Your staff record at <strong>{orgName}</strong> now uses a different email address, so this
        one no longer opens it. Any other organization you use DubGrid with is unchanged.
      </Text>
      <Text {...text.paragraph}>
        If you didn&apos;t expect this, contact support@dubgrid.com right away and we&apos;ll help.
      </Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

SignInMovedEmail.PreviewProps = {
  orgName: "Acme Health",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies SignInMovedEmailProps;

export default SignInMovedEmail;
