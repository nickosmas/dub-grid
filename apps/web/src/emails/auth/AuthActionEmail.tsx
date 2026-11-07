import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailGreeting, EmailSignOff } from "../components/EmailSalutation";
import { EmailButton } from "../components/EmailButton";
import { EmailCode } from "../components/EmailCard";
import { text } from "../components/theme";
import { SUPABASE } from "./placeholders";

export type AuthActionEmailProps = {
  heading: string;
  intro: string;
  ctaLabel: string;
  /** Footer reassurance line. */
  footer: string;
  /**
   * Logo origin. Defaults to the Supabase {{ .SiteURL }} placeholder for the
   * generated templates; the dev preview passes a real URL so the logo loads.
   */
  logoUrl?: string;
  actionHref?: string;
  /**
   * Optional one-time code shown below the button, for flows a native app can
   * complete without following the link. Rendered as the Supabase
   * {{ .Token }} placeholder.
   */
  code?: { label: string };
};

/**
 * Shared single-CTA layout for Supabase auth emails. The action link is always
 * the Supabase {{ .ConfirmationURL }} placeholder; the logo resolves from
 * {{ .SiteURL }}. These render to static HTML for supabase/templates/*.html.
 */
export function AuthActionEmail({
  heading,
  intro,
  ctaLabel,
  footer,
  code,
  logoUrl = SUPABASE.siteUrl,
  actionHref = SUPABASE.confirmationUrl,
}: AuthActionEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={heading}>
      <Text {...text.heading}>{heading}</Text>
      <EmailGreeting />
      <Text {...text.paragraph}>{intro}</Text>
      <EmailButton href={actionHref}>{ctaLabel}</EmailButton>
      {code ? <EmailCode label={code.label} code={SUPABASE.token} /> : null}
      <Text {...text.paragraph}>{footer}</Text>
      <EmailSignOff />
    </EmailLayout>
  );
}
