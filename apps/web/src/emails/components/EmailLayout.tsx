import * as React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailClass, emailDarkCss, emailTheme, styles } from "./theme";

// Go templates have no date function, so this can't be computed at send
// time like the site footer's `{new Date().getFullYear()}` - bump it once
// a year.
const COPYRIGHT_YEAR = 2026;

// Both images are 8x and the same size, so swapping them moves nothing. See
// scripts/generate-wordmark-lockup.mts.
const LOGO_SIZE = { width: 139, height: 46 } as const;

export type EmailLayoutProps = {
  /**
   * Origin used to resolve the logo image, with no trailing slash.
   * App-sent emails pass the runtime site URL; the Supabase auth build
   * passes the literal "{{ .SiteURL }}" placeholder.
   */
  logoUrl: string;
  /** Short inbox preview text (hidden in the body). */
  preview?: string;
  /** The organization this email is from, under the logo. */
  organization?: string;
  /** Why the reader got this or how long it lasts, under the footer rule. */
  fine?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Branded shell for every DubGrid email: one white sheet on a light gray page,
 * logo included, since its white plate would show on the gray. Inside it, only
 * a template's facts or code go in a card.
 *
 * The logo is two images because it's a dark wordmark on light and a white one
 * on dark, and no mail client can recolor an image. See `emailDarkCss`.
 */
export function EmailLayout({ logoUrl, preview, organization, fine, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: emailDarkCss }} />
      </Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body className={emailClass.page} style={styles.body}>
        {/* Many clients drop the body's background, which leaves their own gray beside the column. */}
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          bgcolor={emailTheme.pageBg}
          className={emailClass.page}
          style={styles.page}
        >
          <tbody>
            <tr>
              <td align="center" style={styles.pageCell}>
                <Container
                  bgcolor={emailTheme.sheetBg}
                  className={emailClass.sheet}
                  style={styles.sheet}
                >
                  <Section style={styles.header}>
                    <div className={emailClass.logoLight}>
                      <Img
                        src={`${logoUrl}/email-logo-light.png`}
                        {...LOGO_SIZE}
                        alt="dubgrid"
                        style={{ display: "block" }}
                      />
                    </div>
                    <div
                      className={emailClass.logoDark}
                      style={{ display: "none", maxHeight: 0, overflow: "hidden" }}
                    >
                      <Img
                        src={`${logoUrl}/email-logo-dark.png`}
                        {...LOGO_SIZE}
                        alt=""
                        style={{ display: "block" }}
                      />
                    </div>
                    {organization ? (
                      <Text className={emailClass.ink} style={styles.organization}>
                        {organization}
                      </Text>
                    ) : null}
                  </Section>
                  <Section style={styles.content}>{children}</Section>
                  <Section style={styles.footer}>
                    <Hr className={emailClass.rule} style={styles.divider} />
                    {fine ? (
                      <Text
                        className={emailClass.muted}
                        style={{ ...styles.footerText, margin: "0 0 12px" }}
                      >
                        {fine}
                      </Text>
                    ) : null}
                    <Text className={emailClass.muted} style={styles.footerText}>
                      &copy; {COPYRIGHT_YEAR} DubGrid{"  "}&middot;{"  "}
                      <Link
                        className={emailClass.muted}
                        href={`${logoUrl}/privacy`}
                        style={{ color: emailTheme.textMuted, textDecoration: "underline" }}
                      >
                        Privacy Policy
                      </Link>
                      {"  "}&middot;{"  "}
                      <Link
                        className={emailClass.muted}
                        href={`${logoUrl}/terms`}
                        style={{ color: emailTheme.textMuted, textDecoration: "underline" }}
                      >
                        Terms of Service
                      </Link>
                    </Text>
                  </Section>
                </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}
