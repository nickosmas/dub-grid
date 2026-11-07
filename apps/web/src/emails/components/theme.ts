/**
 * Shared style tokens for email templates, mirrored from the app's
 * design tokens so emails stay in sync with the product palette.
 * Styles stay inline because some clients strip <style>; the dark palette is
 * the one thing that lives in it, as an enhancement over the light inline look.
 */
import { colorTokens } from "@dubgrid/design-tokens";

export const emailTheme = {
  brand: colorTokens.brand, // #2563EB
  pageBg: "#E5E5E5",
  sheetBg: colorTokens.surface, // #FFFFFF
  cardBg: colorTokens.background, // #F8FAFC
  textPrimary: colorTokens.textPrimary, // #0F172A
  textBody: colorTokens.textMuted, // #475569
  textMuted: colorTokens.textSubtle, // #64748B
  textInverse: colorTokens.textInverse, // #FFFFFF
  border: colorTokens.borderSubtle, // #E2E8F0
} as const;

// All black, with zinc only in the text and borders. Outlook for Mac repaints any
// near-black background a mid gray but leaves pure black alone.
const emailDarkTheme = {
  pageBg: "#000000",
  sheetBg: "#000000",
  cardBg: "#000000",
  textPrimary: "#FAFAFA",
  textBody: "#D4D4D8",
  textMuted: "#D4D4D8",
  border: "#3F3F46",
} as const;

export const fontStack =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * `logoUrl` used only by the react-email dev preview (via PreviewProps), so
 * the brand images load: the `email dev` server serves src/emails/static at
 * `/static`, making `${PREVIEW_LOGO_URL}/email-logo-light.png` resolve locally.
 * Production/runtime passes a real origin instead.
 */
export const PREVIEW_LOGO_URL = "/static";

/** The hooks the dark palette below restyles. */
export const emailClass = {
  page: "dg-page",
  sheet: "dg-sheet",
  card: "dg-card",
  ink: "dg-ink",
  body: "dg-body",
  muted: "dg-muted",
  rule: "dg-rule",
  logoLight: "dg-logo-light",
  logoDark: "dg-logo-dark",
} as const;

function darkRules(prefix: string, backgrounds: boolean, text: boolean): string {
  const dark = emailDarkTheme;
  const rules = [
    backgrounds ? `${prefix}.${emailClass.page}{background-color:${dark.pageBg}!important}` : "",
    backgrounds ? `${prefix}.${emailClass.sheet}{background-color:${dark.sheetBg}!important}` : "",
    backgrounds ? `${prefix}.${emailClass.card}{background-color:${dark.cardBg}!important}` : "",
    text ? `${prefix}.${emailClass.card}{border-color:${dark.border}!important}` : "",
    text ? `${prefix}.${emailClass.rule}{border-color:${dark.border}!important}` : "",
    text ? `${prefix}.${emailClass.ink}{color:${dark.textPrimary}!important}` : "",
    text ? `${prefix}.${emailClass.body}{color:${dark.textBody}!important}` : "",
    text ? `${prefix}.${emailClass.muted}{color:${dark.textMuted}!important}` : "",
    text ? `${prefix}.${emailClass.logoLight}{display:none!important}` : "",
    text
      ? `${prefix}.${emailClass.logoDark}{display:block!important;max-height:none!important;overflow:visible!important}`
      : "",
  ];
  return rules.filter(Boolean).join("");
}

/**
 * Apple Mail and others answer the media query; Outlook's web and phone apps
 * mark their dark mode with data-ogsc (text) and data-ogsb (backgrounds). A
 * client that does neither, such as Gmail's phone apps, keeps the light image,
 * whose white plate keeps the logo readable if it darkens the email anyway.
 */
export const emailDarkCss = [
  ":root{color-scheme:light dark;supported-color-schemes:light dark}",
  `@media (prefers-color-scheme:dark){${darkRules("", true, true)}}`,
  darkRules("[data-ogsc] ", false, true),
  darkRules("[data-ogsb] ", true, false),
].join("");

export const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: emailTheme.pageBg,
    fontFamily: fontStack,
  },
  page: {
    width: "100%",
    backgroundColor: emailTheme.pageBg,
  },
  pageCell: {
    padding: "24px 16px",
  },
  sheet: {
    maxWidth: "560px",
    margin: "0 auto",
    backgroundColor: emailTheme.sheetBg,
    borderRadius: "16px",
  },
  // The logo images carry 12px of padding, so their ink lines up with the text.
  header: {
    padding: "24px 12px 12px",
  },
  // Lines up with the wordmark's ink, like the body text.
  organization: {
    margin: "2px 0 0 12px",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 600,
    color: emailTheme.textPrimary,
  },
  content: {
    padding: "12px 24px 8px",
  },
  footer: {
    padding: "0 24px 24px",
  },
  heading: {
    margin: "0 0 20px",
    fontSize: "24px",
    lineHeight: "30px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: emailTheme.textPrimary,
  },
  paragraph: {
    margin: "0 0 20px",
    fontSize: "16px",
    lineHeight: "26px",
    color: emailTheme.textBody,
  },
  fine: {
    margin: 0,
    fontSize: "13px",
    lineHeight: "20px",
    color: emailTheme.textMuted,
  },
  card: {
    margin: "0 0 24px",
    backgroundColor: emailTheme.cardBg,
    border: `1px solid ${emailTheme.border}`,
    borderRadius: "10px",
  },
  divider: {
    borderColor: emailTheme.border,
    borderWidth: "1px 0 0",
    margin: "12px 0 20px",
  },
  footerText: {
    fontSize: "13px",
    lineHeight: "20px",
    color: emailTheme.textMuted,
    margin: 0,
    fontFamily: fontStack,
  },
} as const;

/** Spread onto `Text`: the inline look plus the hook that restyles it in dark mode. */
export const text = {
  heading: { style: styles.heading, className: emailClass.ink },
  paragraph: { style: styles.paragraph, className: emailClass.body },
  fine: { style: styles.fine, className: emailClass.muted },
} as const;
