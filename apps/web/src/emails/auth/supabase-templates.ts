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
  /** The `[auth.email.template.<key>]` block, and `supabase/templates/<key>.html`. */
  key: string;
  Component: ComponentType;
  /** Go placeholders Supabase substitutes at send time; they must survive rendering. */
  placeholders: readonly string[];
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
  },
  {
    key: "email_changed_notification",
    Component: EmailChangedNotificationEmail,
    placeholders: ["{{ .OldEmail }}", "{{ .NewEmail }}", "{{ .SiteURL }}"],
  },
  {
    key: "mfa_factor_enrolled_notification",
    Component: MfaFactorEnrolledEmail,
    placeholders: ["{{ .SiteURL }}"],
  },
  {
    key: "mfa_factor_unenrolled_notification",
    Component: MfaFactorUnenrolledEmail,
    placeholders: ["{{ .SiteURL }}"],
  },
];
