import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type AccessSuspendedEmailProps = {
  logoUrl: string;
  organizationName: string;
  /** The first day they have access again (YYYY-MM-DD, 51g3), when the suspension has an end. */
  suspendedUntil?: string | null;
};

const UNTIL_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function accessSuspendedSubject(organizationName: string): string {
  return `Your access to ${organizationName} is suspended`;
}

/**
 * Sent to a suspended person's own address (51d): they can't sign in to read
 * an alert. It names the organization and nobody in it, and says only their
 * state.
 */
export function AccessSuspendedEmail({
  logoUrl,
  organizationName,
  suspendedUntil = null,
}: AccessSuspendedEmailProps) {
  const subject = accessSuspendedSubject(organizationName);
  const until = suspendedUntil ? new Date(`${suspendedUntil}T00:00:00Z`) : null;
  const untilText =
    until && !Number.isNaN(until.getTime()) ? ` until ${UNTIL_DAY.format(until)}` : " right now";
  return (
    <EmailLayout logoUrl={logoUrl} preview={subject}>
      <Text style={styles.heading}>{subject}</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>
        You can&apos;t sign in to {organizationName}
        {untilText}.
      </Text>
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
