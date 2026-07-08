import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type ImpersonationNoticeEmailProps = {
  orgName?: string;
  /** true = access ended, false = access started. */
  ended: boolean;
  reason?: string;
  logoUrl: string;
};

/** Notifies a user that a platform administrator accessed their account. */
export function ImpersonationNoticeEmail({
  orgName,
  ended,
  reason,
  logoUrl,
}: ImpersonationNoticeEmailProps) {
  const orgDisplay = orgName || "your organization";
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={ended ? "Account access ended" : "Account access notice"}
    >
      <Text style={styles.heading}>{ended ? "Account access ended" : "Account access notice"}</Text>
      <Text style={styles.paragraph}>
        {ended ? (
          <>
            A platform administrator has finished reviewing your account on{" "}
            <strong>{orgDisplay}</strong>. No further action is required.
          </>
        ) : (
          <>
            A platform administrator is currently reviewing your account on{" "}
            <strong>{orgDisplay}</strong> for support purposes. This is a routine support action.
            {reason ? (
              <>
                <br />
                <br />
                <strong>Reason:</strong> {reason}
              </>
            ) : null}
          </>
        )}
      </Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        This is an automated notification from DubGrid. If you have questions about this access,
        please contact your organization administrator.
      </Text>
    </EmailLayout>
  );
}

ImpersonationNoticeEmail.PreviewProps = {
  orgName: "Acme Health",
  ended: false,
  reason: "Investigating a reported scheduling issue.",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies ImpersonationNoticeEmailProps;

export default ImpersonationNoticeEmail;
