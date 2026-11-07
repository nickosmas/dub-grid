import * as React from "react";
import { Text } from "@react-email/components";
import { INVITATION_LIFETIME_HOURS } from "@dubgrid/domain";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { EmailButton } from "./components/EmailButton";
import { styles, text, PREVIEW_LOGO_URL } from "./components/theme";
import { formatInvitationExpiry } from "./invitation-expiry";

export type InvitationEmailKind = "new" | "reissue" | "moved";

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
  /** This address already has an account, so there's no password to set. */
  hasAccount?: boolean;
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
  hasAccount = false,
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
      organization={orgName}
      fine={
        <>
          {deadline
            ? `That's ${INVITATION_LIFETIME_HOURS} hours after it was sent, and it doesn't extend.`
            : null}{" "}
          If we send you another invitation, only the link in the newest email will work.
        </>
      }
    >
      <Text {...text.heading}>
        {reissue ? "Here's your new invitation" : "You're invited to DubGrid"}
      </Text>
      <EmailGreeting />
      <Text {...text.paragraph}>
        {reissue ? (
          <>
            Here&apos;s a new invitation to join <strong>{orgName}</strong> on DubGrid. It replaces
            your earlier one, so the link in that email no longer works.
          </>
        ) : (
          <>
            You&apos;ve been invited to join <strong>{orgName}</strong> on DubGrid.
          </>
        )}
      </Text>
      <Text {...text.paragraph}>
        {hasAccount
          ? "You already have a DubGrid account with this email address, so there's nothing to set up. Sign in with your password to accept."
          : "To get started, set your password and accept your invitation."}
      </Text>
      <EmailButton href={acceptUrl}>Accept invitation</EmailButton>
      <Text {...text.paragraph}>
        {deadline ? (
          <>
            This invitation expires on <strong>{deadline}</strong>.
          </>
        ) : (
          `This invitation expires ${INVITATION_LIFETIME_HOURS} hours after it was sent, and it doesn't extend.`
        )}
      </Text>
      {kind === "moved" ? (
        <Text {...text.paragraph}>
          Already use DubGrid with another organization? Contact support@dubgrid.com and we&apos;ll
          keep you on one account.
        </Text>
      ) : null}
      <Text {...text.fine} style={{ ...styles.fine, margin: "0 0 4px" }}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
      </Text>
      <Text {...text.fine} style={{ ...styles.fine, wordBreak: "break-all", margin: "0 0 20px" }}>
        {acceptUrl}
      </Text>
      <Text {...text.paragraph}>
        If you didn&apos;t expect this email, you can safely ignore it.
      </Text>
      <EmailSignOff />
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
