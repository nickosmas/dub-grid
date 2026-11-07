import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "../components/EmailSalutation";
import { EmailDetails, type EmailDetail } from "../components/EmailCard";
import { text } from "../components/theme";
import { SUPABASE } from "./placeholders";

export type SecurityNotificationEmailProps = {
  heading: string;
  body: React.ReactNode;
  /** Facts the body refers to. */
  details?: EmailDetail[];
  /**
   * What to do next, both for the "this was me" and the
   * "this wasn't me" case. Each event has different stakes (e.g. losing an
   * MFA factor vs. a routine password change), so this is per-template
   * rather than one generic line.
   */
  footer: React.ReactNode;
  /**
   * Logo origin. Defaults to the Supabase {{ .SiteURL }} placeholder for the
   * generated templates; the dev preview passes a real URL so the logo loads.
   */
  logoUrl?: string;
};

/**
 * Shared no-CTA layout for Supabase's security-notification auth emails
 * (password changed, email changed, MFA factor added/removed). Unlike
 * AuthActionEmail these have no confirmation link - they're after-the-fact
 * alerts, so there's just a heading, a body line, and a "what to do next"
 * note. These render to static HTML for supabase/templates/*.html.
 */
export function SecurityNotificationEmail({
  heading,
  body,
  details,
  footer,
  logoUrl = SUPABASE.siteUrl,
}: SecurityNotificationEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={heading}>
      <Text {...text.heading}>{heading}</Text>
      <EmailGreeting />
      <Text {...text.paragraph}>{body}</Text>
      {details ? <EmailDetails details={details} /> : null}
      <Text {...text.paragraph}>{footer}</Text>
      <EmailSignOff />
    </EmailLayout>
  );
}
