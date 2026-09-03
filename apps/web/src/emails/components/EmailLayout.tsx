import * as React from "react";
import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailTheme, styles } from "./theme";

// Go templates have no date function, so this can't be computed at send
// time like the site footer's `{new Date().getFullYear()}` - bump it once
// a year.
const COPYRIGHT_YEAR = 2026;

export type EmailLayoutProps = {
  /**
   * Origin used to resolve the logo image, with no trailing slash.
   * App-sent emails pass the runtime site URL; the Supabase auth build
   * passes the literal "{{ .SiteURL }}" placeholder.
   */
  logoUrl: string;
  /** Short inbox preview text (hidden in the body). */
  preview?: string;
  children: React.ReactNode;
};

/**
 * Branded shell for every DubGrid email: grid logo + lowercase "dubgrid"
 * wordmark over a white card, matching the in-app brand.
 */
export function EmailLayout({ logoUrl, preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        {/* DM Sans is a variable font: one woff2 covers every weight. We
            declare 400 + 700 so body (400) and headings/wordmark (700) both
            resolve. Gmail strips web fonts, so the logo carries the brand
            there; Apple Mail and the dev preview honor this. */}
        {[400, 700].map((weight) => (
          <Font
            key={weight}
            fontFamily="DM Sans"
            fallbackFontFamily="Arial"
            webFont={{
              url: "https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K6z9mXg.woff2",
              format: "woff2",
            }}
            fontWeight={weight}
            fontStyle="normal"
          />
        ))}
      </Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.header}>
              {/* Lockup is a pre-rendered image (grid + DM Sans wordmark) so the
                  brand mark is identical even in clients that strip web fonts.
                  Source is 4x (668x184); displayed at 167x46. See
                  scripts/generate-wordmark-lockup.mts. */}
              <Img
                src={`${logoUrl}/email-lockup.png`}
                width={167}
                height={46}
                alt="dubgrid"
                style={{ display: "inline-block" }}
              />
            </Section>
            <Section style={styles.content}>{children}</Section>
          </Section>
          <Section style={styles.footer}>
            {/* Footer wordmark image (muted), 67x24 displayed / 8x source. */}
            <Img
              src={`${logoUrl}/email-wordmark.png`}
              width={67}
              height={24}
              alt="dubgrid"
              style={{ display: "inline-block" }}
            />
            <Text style={{ ...styles.footerText, margin: "12px 0 6px" }}>
              &copy; {COPYRIGHT_YEAR} DubGrid
            </Text>
            <Text style={styles.footerText}>
              <Link
                href={`${logoUrl}/privacy`}
                style={{ color: emailTheme.textMuted, textDecoration: "underline" }}
              >
                Privacy Policy
              </Link>
              {"  "}&middot;{"  "}
              <Link
                href={`${logoUrl}/terms`}
                style={{ color: emailTheme.textMuted, textDecoration: "underline" }}
              >
                Terms of Service
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
