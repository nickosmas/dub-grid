import * as React from "react";
import { Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type NotificationEmailDetail = { label: string; value: string };

export type NotificationEmailProps = {
  title: string;
  message: string;
  /** Facts shown one per line under the message, each with a bold label. */
  details?: NotificationEmailDetail[];
  /** A paragraph after the details, such as what to do if it wasn't the reader. */
  closing?: string;
  logoUrl: string;
  /** The organization the notification came from, shown above the heading. */
  context?: string;
  /** A security alert, which no preference turns off. */
  alwaysOn?: boolean;
};

/** Generic in-app notification delivered over email. */
export function NotificationEmail({
  title,
  message,
  details = [],
  closing,
  logoUrl,
  context,
  alwaysOn = false,
}: NotificationEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={context ? `${context}: ${title}` : title}>
      {context ? <Text style={{ ...styles.fine, margin: "0 0 8px" }}>{context}</Text> : null}
      <Text style={styles.heading}>{title}</Text>
      <EmailGreeting />
      <Text style={styles.paragraph}>{message}</Text>
      {details.length > 0 ? (
        <Section style={styles.detailList}>
          {details.map(({ label, value }) => (
            <Text key={label} style={styles.detail}>
              <strong style={styles.detailLabel}>{label}</strong>: {value}
            </Text>
          ))}
        </Section>
      ) : null}
      {closing ? <Text style={styles.paragraph}>{closing}</Text> : null}
      <EmailSignOff />
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        {alwaysOn
          ? "Security alerts are always on, so they reach you whatever your notification settings."
          : "You can manage your notification preferences in your DubGrid profile settings."}
      </Text>
    </EmailLayout>
  );
}

NotificationEmail.PreviewProps = {
  title: "Your shift was updated",
  message: "Your Tuesday shift now starts at 7:00 AM instead of 8:00 AM.",
  logoUrl: PREVIEW_LOGO_URL,
  context: "Calm Haven",
} satisfies NotificationEmailProps;

export default NotificationEmail;
