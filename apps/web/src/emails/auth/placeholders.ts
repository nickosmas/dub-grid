/**
 * Supabase Go-template placeholders, kept as literal strings so they survive
 * react-email rendering untouched and are substituted by Supabase at send time.
 * See https://supabase.com/docs/guides/auth/auth-email-templates
 */
export const SUPABASE = {
  confirmationUrl: "{{ .ConfirmationURL }}",
  token: "{{ .Token }}",
  tokenHash: "{{ .TokenHash }}",
  /** Site origin (no trailing slash) used to resolve the logo image. */
  siteUrl: "{{ .SiteURL }}",
  oldEmail: "{{ .OldEmail }}",
  newEmail: "{{ .NewEmail }}",
} as const;

export const RECOVERY_VERIFICATION_URL =
  "{{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password";

// Preview-only logoUrl, so the dev preview loads the brand images. The
// generated templates keep the {{ .SiteURL }} placeholder.
export { PREVIEW_LOGO_URL } from "../components/theme";
