import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { text, PREVIEW_LOGO_URL } from "./components/theme";

/** Who made the change: an organization administrator, the person themselves, or DubGrid support. */
export type LoginEmailChangedBy = "administrator" | "self" | "support";

/**
 * Which sessions the change ended. Only what actually happened is claimed:
 * changing your own record keeps the device you did it on, and a sign-out
 * that failed is never reported as done.
 */
export type LoginEmailSignOut = "everywhere" | "other-devices" | "not-confirmed";

export type LoginEmailChangedEmailProps = {
  orgName: string;
  /**
   * The previous address is the member's own verified sign-in, so it may learn
   * where the sign-in went. The new address was typed by someone else and may
   * be a stranger's, so it learns nothing about the previous one.
   */
  recipient: "previous" | "new";
  newEmail: string;
  logoUrl: string;
  changedBy?: LoginEmailChangedBy;
  signOut?: LoginEmailSignOut;
};

const SIGN_OUT_SENTENCE: Record<LoginEmailSignOut, string> = {
  everywhere: "For your security, we've signed you out on your devices.",
  "other-devices": "For your security, we've signed you out on your other devices.",
  "not-confirmed": "Sign out of any device you don't recognize.",
};

function changeSentence(
  changedBy: LoginEmailChangedBy,
  orgName: string,
  newEmail: string,
): React.ReactNode {
  const to = <strong>{newEmail}</strong>;
  if (changedBy === "self") return <>Your DubGrid email address was changed to {to}.</>;
  if (changedBy === "support")
    return <>DubGrid support changed your DubGrid email address to {to}.</>;
  return (
    <>
      An administrator at <strong>{orgName}</strong> changed your DubGrid email address to {to}.
    </>
  );
}

function newAddressSentence(changedBy: LoginEmailChangedBy, orgName: string): React.ReactNode {
  if (changedBy === "self") {
    return <>Your DubGrid account now uses this email address. Use it the next time you sign in.</>;
  }
  const who =
    changedBy === "support" ? (
      "DubGrid support"
    ) : (
      <>
        An administrator at <strong>{orgName}</strong>
      </>
    );
  return (
    <>
      {who} updated a DubGrid account to use this email address. Use it the next time you sign in.
    </>
  );
}

/** Sent to both addresses when someone's sign-in email is changed from their staff record. */
export function LoginEmailChangedEmail({
  orgName,
  recipient,
  newEmail,
  logoUrl,
  changedBy = "administrator",
  signOut = "everywhere",
}: LoginEmailChangedEmailProps) {
  const heading =
    recipient === "previous"
      ? "Your email address was changed"
      : "Your DubGrid email address was updated";
  const contact =
    changedBy === "administrator" ? `${orgName} or support@dubgrid.com` : "support@dubgrid.com";
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={heading}
      // Only an administrator's change is about the organization. The other two
      // are about the account, and these may reach a mistyped address.
      organization={changedBy === "administrator" ? orgName : undefined}
    >
      <Text {...text.heading}>{heading}</Text>
      <EmailGreeting />
      <Text {...text.paragraph}>
        {recipient === "previous" ? (
          <>
            {changeSentence(changedBy, orgName, newEmail)} {SIGN_OUT_SENTENCE[signOut]} Sign in with
            your new email address from now on.
          </>
        ) : (
          newAddressSentence(changedBy, orgName)
        )}
      </Text>
      <Text {...text.paragraph}>
        {recipient === "previous"
          ? changedBy === "self"
            ? "If this wasn't you, change your password and contact support@dubgrid.com right away."
            : `If you didn't expect this, contact ${contact} right away.`
          : changedBy === "self"
            ? "If this wasn't you, contact support@dubgrid.com."
            : changedBy === "support"
              ? "If you weren't expecting this, contact support@dubgrid.com."
              : `If you don't work with ${orgName}, contact support@dubgrid.com.`}
      </Text>
      <EmailSignOff />
    </EmailLayout>
  );
}

LoginEmailChangedEmail.PreviewProps = {
  orgName: "Acme Health",
  recipient: "previous",
  newEmail: "new.address@example.com",
  logoUrl: PREVIEW_LOGO_URL,
  changedBy: "administrator",
  signOut: "everywhere",
} satisfies LoginEmailChangedEmailProps;

export default LoginEmailChangedEmail;
