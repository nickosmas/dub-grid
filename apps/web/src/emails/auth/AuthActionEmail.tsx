import * as React from "react";
import { Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailButton } from "../components/EmailButton";
import { emailTheme, fontStack, styles } from "../components/theme";
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
      <Text style={{ ...styles.heading, textAlign: "center" }}>{heading}</Text>
      <Text style={{ ...styles.paragraph, textAlign: "center", fontSize: "15px" }}>{intro}</Text>
      <EmailButton href={actionHref}>{ctaLabel}</EmailButton>
      {code ? (
        <Section style={{ textAlign: "center", margin: "0 0 32px" }}>
          <Text style={{ ...styles.fine, textAlign: "center", margin: "0 0 12px" }}>
            {code.label}
          </Text>
          <Text
            style={{
              display: "inline-block",
              fontFamily: fontStack,
              fontSize: "32px",
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: emailTheme.brand,
              backgroundColor: emailTheme.pageBg,
              border: `1px solid ${emailTheme.border}`,
              borderRadius: "8px",
              padding: "16px 28px",
              margin: 0,
            }}
          >
            {SUPABASE.token}
          </Text>
        </Section>
      ) : null}
      <Hr style={styles.divider} />
      <Text style={{ ...styles.fine, textAlign: "center" }}>{footer}</Text>
    </EmailLayout>
  );
}
