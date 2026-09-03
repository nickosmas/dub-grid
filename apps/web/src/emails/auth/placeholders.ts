/**
 * Supabase Go-template placeholders, kept as literal strings so they survive
 * react-email rendering untouched and are substituted by Supabase at send time.
 * See https://supabase.com/docs/guides/auth/auth-email-templates
 */
export const SUPABASE = {
  confirmationUrl: "{{ .ConfirmationURL }}",
  token: "{{ .Token }}",
  /** Site origin (no trailing slash) used to resolve the logo image. */
  siteUrl: "{{ .SiteURL }}",
  /** MFA factor type; only populated on the mfa_factor_(en|un)rolled_notification templates. */
  factorType: "{{ .FactorType }}",
  oldEmail: "{{ .OldEmail }}",
  newEmail: "{{ .NewEmail }}",
} as const;

// Preview-only logoUrl, so the dev preview loads the brand images. The
// generated templates keep the {{ .SiteURL }} placeholder.
export { PREVIEW_LOGO_URL } from "../components/theme";
