import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { EmailButton } from "./components/EmailButton";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";
import { formatInvitationExpiry } from "./invitation-expiry";

export type InvitationEmailKind = "new" | "reissue";

export type InviteEmailProps = {
  orgName: string;
  acceptUrl: string;
  logoUrl: string;
  /** When the link stops working, as stored on the invitation. */
  expiresAt: string | null;
  /** The organization's zone, which the deadline is written in. */
  timeZone: string | null;
  /** A reissue replaces an earlier invitation, whose link no longer works. */
  kind: InvitationEmailKind;
};

/**
 * Invitation to join an organization. Used by web + mobile invite flows.
 *
 * It names the organization and nobody in it. The address is typed by an
 * admin, so a mistyped or reassigned one reaches a stranger, who must not learn
 * who sent it or that person's email.
 */
export function InviteEmail({
  orgName,
  acceptUrl,
  logoUrl,
  expiresAt,
  timeZone,
  kind,
}: InviteEmailProps) {
  const deadline = formatInvitationExpiry(expiresAt, timeZone);
  const reissue = kind === "reissue";
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={
        reissue
          ? `Your new invitation to join ${orgName} on DubGrid`
          : `You're invited to join ${orgName} on DubGrid`
      }
    >
      <Text style={styles.heading}>
        {reissue ? "Here's your new invitation" : "You're invited to DubGrid"}
      </Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>
        {reissue ? (
          <>
            Here&apos;s a new invitation to join <strong>{orgName}</strong> on DubGrid. It replaces
            your earlier one, so the link in that email no longer works.
          </>
        ) : (
          <>
            You&apos;ve been invited to join <strong>{orgName}</strong> on DubGrid, where
            you&apos;ll find your schedule, shift requests and team updates in one place.
          </>
        )}
      </Text>
      <Text style={{ ...styles.paragraph, fontSize: "15px" }}>
        To get started, set your password and accept your invitation.
      </Text>
      <EmailButton href={acceptUrl}>Accept invitation</EmailButton>
      <Text style={{ ...styles.fine, margin: "0 0 8px" }}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
      </Text>
      <Text style={{ ...styles.fine, wordBreak: "break-all", margin: "0 0 24px" }}>
        {acceptUrl}
      </Text>
      <Text style={styles.paragraph}>
        If you didn&apos;t expect this email, you can safely ignore it.
      </Text>
      <EmailSignOff />
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        {deadline
          ? `This invitation expires on ${deadline}. That's 72 hours after it was sent, and it doesn't extend.`
          : "This invitation expires 72 hours after it was sent, and it doesn't extend."}{" "}
        If we send you another invitation, only the link in the newest email will work.
      </Text>
    </EmailLayout>
  );
}

InviteEmail.PreviewProps = {
  orgName: "Acme Health",
  acceptUrl: "https://app.dubgrid.com/accept-invite?token=demo-token&email=you%40example.com",
  logoUrl: PREVIEW_LOGO_URL,
  expiresAt: "2026-09-28T22:04:00.000Z",
  timeZone: "America/Los_Angeles",
  kind: "new",
} satisfies InviteEmailProps;

export default InviteEmail;
