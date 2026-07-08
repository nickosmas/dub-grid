import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailButton } from "../components/EmailButton";
import { styles } from "../components/theme";
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
  logoUrl = SUPABASE.siteUrl,
}: AuthActionEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={heading}>
      <Text style={{ ...styles.heading, textAlign: "center" }}>{heading}</Text>
      <Text style={{ ...styles.paragraph, textAlign: "center", fontSize: "15px" }}>{intro}</Text>
      <EmailButton href={SUPABASE.confirmationUrl}>{ctaLabel}</EmailButton>
      <Hr style={styles.divider} />
      <Text style={{ ...styles.fine, textAlign: "center" }}>{footer}</Text>
    </EmailLayout>
  );
}
