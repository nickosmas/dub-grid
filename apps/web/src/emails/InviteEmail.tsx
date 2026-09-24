import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type InviteEmailProps = {
  orgName: string;
  acceptUrl: string;
  logoUrl: string;
};

/**
 * Invitation to join an organization. Used by web + mobile invite flows.
 *
 * It names the organization and nobody in it. The address is typed by an
 * admin, so a mistyped or reassigned one reaches a stranger, who must not learn
 * who sent it or that person's email.
 */
export function InviteEmail({ orgName, acceptUrl, logoUrl }: InviteEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={`You're invited to join ${orgName} on DubGrid`}>
      <Text style={styles.heading}>You&apos;re invited</Text>
      <Text style={styles.paragraph}>
        You&apos;ve been invited to join <strong>{orgName}</strong> on DubGrid.
      </Text>
      <Text style={{ ...styles.paragraph, fontSize: "15px" }}>
        Click the button below to set your password and accept your invitation.
      </Text>
      <EmailButton href={acceptUrl}>Accept invitation</EmailButton>
      <Text style={{ ...styles.fine, margin: "0 0 8px" }}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
      </Text>
      <Text style={{ ...styles.fine, wordBreak: "break-all" }}>{acceptUrl}</Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        This invitation expires in 72 hours. If you didn&apos;t expect this email, you can safely
        ignore it.
      </Text>
    </EmailLayout>
  );
}

InviteEmail.PreviewProps = {
  orgName: "Acme Health",
  acceptUrl: "https://app.dubgrid.com/accept-invite?token=demo-token&email=you%40example.com",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies InviteEmailProps;

export default InviteEmail;
