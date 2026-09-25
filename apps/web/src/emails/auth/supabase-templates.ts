import type { ComponentType } from "react";
import { AuthInviteEmail } from "./AuthInviteEmail";
import { ConfirmationEmail } from "./ConfirmationEmail";
import { EmailChangeEmail } from "./EmailChangeEmail";
import { EmailChangedNotificationEmail } from "./EmailChangedNotificationEmail";
import { MagicLinkEmail } from "./MagicLinkEmail";
import { MfaFactorEnrolledEmail } from "./MfaFactorEnrolledEmail";
import { MfaFactorUnenrolledEmail } from "./MfaFactorUnenrolledEmail";
import { PasswordChangedEmail } from "./PasswordChangedEmail";
import { ReauthenticationEmail } from "./ReauthenticationEmail";
import { RecoveryEmail } from "./RecoveryEmail";

export interface SupabaseAuthTemplate {
  /**
   * `supabase/templates/<key>.html`, and the Management API field names. An
   * action email is declared in `[auth.email.template.<key>]`.
   */
  key: string;
  Component: ComponentType;
  /** Go placeholders Supabase substitutes at send time; they must survive rendering. */
  placeholders: readonly string[];
  /**
   * A security notice is declared in `[auth.email.notification.<type>]` and
   * sends only when enabled. All four are on: nothing in DubGrid emails the
   * password and email notices, and the MFA notices reach the owner even for a
   * change made with a stolen token that never passes through DubGrid.
   */
  notification?: { type: string; enabled: boolean };
}

/**
 * Every Supabase auth email, rendered to `supabase/templates/` by
 * `npm run email:build` and checked against that HTML by the normal test run.
 */
export const SUPABASE_AUTH_TEMPLATES: readonly SupabaseAuthTemplate[] = [
  {
    key: "confirmation",
    Component: ConfirmationEmail,
    placeholders: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
  },
  {
    key: "recovery",
    Component: RecoveryEmail,
    placeholders: ["{{ .TokenHash }}", "{{ .Token }}", "{{ .SiteURL }}", "/auth/verify"],
  },
  {
    key: "magic_link",
    Component: MagicLinkEmail,
    placeholders: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
  },
  {
    key: "invite",
    Component: AuthInviteEmail,
    placeholders: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
  },
  {
    key: "email_change",
    Component: EmailChangeEmail,
    placeholders: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
  },
  {
    key: "reauthentication",
    Component: ReauthenticationEmail,
    placeholders: ["{{ .Token }}", "{{ .SiteURL }}"],
  },
  {
    key: "password_changed_notification",
    Component: PasswordChangedEmail,
    placeholders: ["{{ .SiteURL }}"],
    notification: { type: "password_changed", enabled: true },
  },
  {
    key: "email_changed_notification",
    Component: EmailChangedNotificationEmail,
    placeholders: ["{{ .OldEmail }}", "{{ .NewEmail }}", "{{ .SiteURL }}"],
    notification: { type: "email_changed", enabled: true },
  },
  {
    key: "mfa_factor_enrolled_notification",
    Component: MfaFactorEnrolledEmail,
    placeholders: ["{{ .SiteURL }}"],
    notification: { type: "mfa_factor_enrolled", enabled: true },
  },
  {
    key: "mfa_factor_unenrolled_notification",
    Component: MfaFactorUnenrolledEmail,
    placeholders: ["{{ .SiteURL }}"],
    notification: { type: "mfa_factor_unenrolled", enabled: true },
  },
];
