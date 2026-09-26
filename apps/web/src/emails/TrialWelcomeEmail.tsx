import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type TrialWelcomeEmailProps = {
  orgName: string;
  /** Pre-formatted trial end date (e.g. "June 4, 2026") or "soon". */
  trialEndDate: string;
  logoUrl: string;
};

/** Sent once when an organization's 14-day trial starts. */
export function TrialWelcomeEmail({ orgName, trialEndDate, logoUrl }: TrialWelcomeEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={`Your DubGrid trial for ${orgName} has started`}>
      <Text style={styles.heading}>Your free trial has started</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>
        Thanks for choosing DubGrid! Your 14-day free trial for <strong>{orgName}</strong> is now
        active, with every feature unlocked.
      </Text>
      <Text style={styles.paragraph}>
        Your trial ends on <strong>{trialEndDate}</strong>. To keep using DubGrid after that, add a
        subscription any time from Billing in Settings.
      </Text>
      <Text style={styles.paragraph}>There&apos;s nothing else you need to do right now.</Text>
      <EmailSignOff />
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        You&apos;re receiving this because you&apos;re an administrator for {orgName}.
      </Text>
    </EmailLayout>
  );
}

TrialWelcomeEmail.PreviewProps = {
  orgName: "Acme Health",
  trialEndDate: "June 4, 2026",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies TrialWelcomeEmailProps;

export default TrialWelcomeEmail;
