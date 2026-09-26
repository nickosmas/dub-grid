import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";
import { formatInvitationExpiry } from "./invitation-expiry";

export type ImpersonationNoticeEmailProps = {
  orgName?: string;
  /** true = access ended, false = access started. */
  ended: boolean;
  /** When a started session ends at the latest. */
  expiresAt?: string | null;
  /** The organization's zone, for the deadline. */
  timeZone?: string | null;
  logoUrl: string;
};

/** The subject for a notice, kept beside the copy it summarizes. */
export function impersonationNoticeSubject(ended: boolean, orgName?: string): string {
  const where = orgName ? ` in ${orgName}` : "";
  return ended
    ? `DubGrid support has left your account${where}`
    : `DubGrid support is using your account${where}`;
}

/**
 * Tells a person that DubGrid support used their account, and then that it
 * stopped. It names no one at DubGrid and carries no free-text reason, since
 * the address may not be theirs.
 */
export function ImpersonationNoticeEmail({
  orgName,
  ended,
  expiresAt,
  timeZone,
  logoUrl,
}: ImpersonationNoticeEmailProps) {
  const heading = ended
    ? "DubGrid support has left your account"
    : "DubGrid support is using your account";
  const where = orgName ? <strong>{orgName}</strong> : "DubGrid";
  const deadline = ended ? null : formatInvitationExpiry(expiresAt, timeZone);
  return (
    <EmailLayout logoUrl={logoUrl} preview={heading}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.paragraph}>
        {ended ? (
          <>DubGrid support is no longer using your account in {where}.</>
        ) : (
          <>
            DubGrid support is using your account in {where}.
            {deadline ? ` This access ends by ${deadline} at the latest.` : null}
          </>
        )}
      </Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        If you weren&apos;t expecting this, contact support@dubgrid.com.
      </Text>
    </EmailLayout>
  );
}

ImpersonationNoticeEmail.PreviewProps = {
  orgName: "Acme Health",
  ended: false,
  expiresAt: "2026-09-28T22:04:00.000Z",
  timeZone: "America/Los_Angeles",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies ImpersonationNoticeEmailProps;

export default ImpersonationNoticeEmail;
