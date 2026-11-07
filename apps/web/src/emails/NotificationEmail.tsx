import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "./components/EmailSalutation";
import { EmailButton } from "./components/EmailButton";
import { EmailDetails } from "./components/EmailCard";
import { text, PREVIEW_LOGO_URL } from "./components/theme";

export type NotificationEmailDetail = { label: string; value: string };

export type NotificationEmailProps = {
  title: string;
  message: string;
  /** Facts shown one per line under the message, each with a bold label. */
  details?: NotificationEmailDetail[];
  /** A paragraph after the details, such as what to do if it wasn't the reader. */
  closing?: string;
  logoUrl: string;
  /** The organization the notification came from, shown under the logo. */
  context?: string;
  /** A security alert, which no preference turns off. */
  alwaysOn?: boolean;
  /** Where the reader goes next, when the alert has one link. */
  action?: { label: string; href: string };
  firstName?: string | null;
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
  action,
  firstName,
}: NotificationEmailProps) {
  return (
    <EmailLayout
      logoUrl={logoUrl}
      preview={context ? `${context}: ${title}` : title}
      organization={context}
      fine={
        alwaysOn
          ? "Security alerts are always on, so they reach you whatever your notification settings."
          : "You can manage your notification preferences in your DubGrid profile settings."
      }
    >
      <Text {...text.heading}>{title}</Text>
      <EmailGreeting firstName={firstName} />
      <Text {...text.paragraph}>{message}</Text>
      {details.length > 0 ? <EmailDetails details={details} /> : null}
      {closing ? <Text {...text.paragraph}>{closing}</Text> : null}
      {action ? <EmailButton href={action.href}>{action.label}</EmailButton> : null}
      <EmailSignOff />
    </EmailLayout>
  );
}

NotificationEmail.PreviewProps = {
  title: "Your shift was updated",
  message: "Your Tuesday shift now starts at 7:00 AM instead of 8:00 AM.",
  logoUrl: PREVIEW_LOGO_URL,
  context: "Calm Haven",
  action: { label: "Open schedule", href: "https://calmhaven.dubgrid.com/schedule" },
  firstName: "Maria",
} satisfies NotificationEmailProps;

export default NotificationEmail;
