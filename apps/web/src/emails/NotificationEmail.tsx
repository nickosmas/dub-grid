import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { styles, PREVIEW_LOGO_URL } from "./components/theme";

export type NotificationEmailProps = {
  title: string;
  message: string;
  logoUrl: string;
};

/** Generic in-app notification delivered over email. */
export function NotificationEmail({ title, message, logoUrl }: NotificationEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={title}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.paragraph}>{message}</Text>
      <Hr style={styles.divider} />
      <Text style={styles.fine}>
        You can manage your notification preferences in your DubGrid profile settings.
      </Text>
    </EmailLayout>
  );
}

NotificationEmail.PreviewProps = {
  title: "Your shift was updated",
  message: "Your Tuesday shift now starts at 7:00 AM instead of 8:00 AM.",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies NotificationEmailProps;

export default NotificationEmail;
