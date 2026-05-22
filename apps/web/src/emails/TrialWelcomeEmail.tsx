import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type TrialWelcomeEmailProps = {
  orgName: string;
  /** Pre-formatted trial end date (e.g. "June 4, 2026") or "soon". */
  trialEndDate: string;
  logoUrl: string;
};

/** Sent once when an organization's 14-day trial starts. */
export function TrialWelcomeEmail({
  orgName,
  trialEndDate,
  logoUrl,
}: TrialWelcomeEmailProps) {
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={`Your DubGrid trial for ${orgName} has started`}
    >
      <Text style={styles.heading}>Your trial has started</Text>
      <Text style={styles.paragraph}>
        Your 14-day free trial of DubGrid for <strong>{orgName}</strong> is now
        active.
      </Text>
      <Text style={styles.paragraph}>
        The trial ends on <strong>{trialEndDate}</strong>. To keep using
        DubGrid after that, add a subscription before the trial ends. You can do
        this any time from Settings, under Billing.
      </Text>
      <Text style={{ ...styles.paragraph, fontSize: "15px", margin: "0 0 8px" }}>
        Everything is unlocked during the trial, so there is nothing else you
        need to do right now.
      </Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        You&apos;re receiving this because you&apos;re an administrator for{" "}
        {orgName}.
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
