/**
 * Shared style tokens for email templates, mirrored from the app's
 * design tokens so emails stay in sync with the product palette.
 * Inline styles are used throughout because email clients strip <style>.
 */
import { colorTokens } from "@dubgrid/design-tokens";

export const emailTheme = {
  brand: colorTokens.brand, // #2563EB
  pageBg: colorTokens.background, // #F8FAFC
  cardBg: colorTokens.surface, // #FFFFFF
  textPrimary: colorTokens.textPrimary, // #0F172A
  textBody: colorTokens.textMuted, // #475569
  textMuted: colorTokens.textSubtle, // #64748B
  textInverse: colorTokens.textInverse, // #FFFFFF
  border: colorTokens.borderSubtle, // #E2E8F0
} as const;

export const fontStack =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * `logoUrl` used only by the react-email dev preview (via PreviewProps), so
 * the brand images load: the `email dev` server serves src/emails/static at
 * `/static`, making `${PREVIEW_LOGO_URL}/email-lockup.png` resolve locally.
 * Production/runtime passes a real origin instead.
 */
export const PREVIEW_LOGO_URL = "/static";

export const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: emailTheme.pageBg,
    fontFamily: fontStack,
  },
  container: {
    maxWidth: "520px",
    margin: "40px auto",
    padding: "0 16px",
  },
  card: {
    backgroundColor: emailTheme.cardBg,
    borderRadius: "var(--dg-radius-xl)",
    overflow: "hidden",
    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
  },
  header: {
    padding: "32px 32px 0",
    textAlign: "center" as const,
  },
  wordmark: {
    fontSize: "22px",
    lineHeight: "1",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: emailTheme.textPrimary,
    fontFamily: fontStack,
    margin: "12px 0 0",
  },
  content: {
    padding: "32px",
  },
  heading: {
    margin: "0 0 16px",
    fontSize: "22px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: emailTheme.textPrimary,
  },
  paragraph: {
    margin: "0 0 24px",
    fontSize: "16px",
    lineHeight: "1.6",
    color: emailTheme.textBody,
  },
  fine: {
    margin: 0,
    fontSize: "13px",
    lineHeight: "1.6",
    color: emailTheme.textMuted,
  },
  divider: {
    borderColor: emailTheme.border,
    borderWidth: "1px 0 0",
    margin: "24px 0 20px",
  },
  footer: {
    padding: "20px 0",
    textAlign: "center" as const,
  },
  footerText: {
    fontSize: "12px",
    color: emailTheme.textMuted,
    margin: 0,
    fontFamily: fontStack,
  },
} as const;
