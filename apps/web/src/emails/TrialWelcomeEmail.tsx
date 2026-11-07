import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { text, PREVIEW_LOGO_URL } from "./components/theme";

export type TrialWelcomeEmailProps = {
  orgName: string;
  /** Pre-formatted trial end date (e.g. "June 4, 2026") or "soon". */
  trialEndDate: string;
  logoUrl: string;
  firstName?: string | null;
};

/** Sent once when an organization's free trial starts. */
export function TrialWelcomeEmail({
  orgName,
  trialEndDate,
  logoUrl,
  firstName,
}: TrialWelcomeEmailProps) {
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={`Your DubGrid trial for ${orgName} has started`}
      organization={orgName}
      fine={<>You&apos;re receiving this because you&apos;re an administrator for {orgName}.</>}
    >
      <Text {...text.heading}>Your free trial has started</Text>
      <EmailGreeting firstName={firstName} />
      <Text {...text.paragraph}>
        Your free trial for <strong>{orgName}</strong> is active, with everything included.
      </Text>
      <Text {...text.paragraph}>
        Your trial ends on <strong>{trialEndDate}</strong>. To keep using DubGrid after that, add a
        subscription any time from Billing in Settings.
      </Text>
      <Text {...text.paragraph}>There&apos;s nothing else you need to do right now.</Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

TrialWelcomeEmail.PreviewProps = {
  orgName: "Acme Health",
  trialEndDate: "June 4, 2026",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies TrialWelcomeEmailProps;

export default TrialWelcomeEmail;
