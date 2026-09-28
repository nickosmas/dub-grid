/**
 * The `mailer_*` properties of `UpdateAuthConfigBody` in the Supabase
 * Management API schema (https://api.supabase.com/api/v1-json), read
 * 2026-09-28. The template push writes only these; a field it sends that is
 * missing here was renamed or never existed upstream. Refresh from the schema
 * when the push starts writing a new kind of field.
 */
export const MANAGEMENT_API_MAILER_FIELDS = [
  "mailer_allow_unverified_email_sign_ins",
  "mailer_autoconfirm",
  "mailer_notifications_email_changed_enabled",
  "mailer_notifications_identity_linked_enabled",
  "mailer_notifications_identity_unlinked_enabled",
  "mailer_notifications_mfa_factor_enrolled_enabled",
  "mailer_notifications_mfa_factor_unenrolled_enabled",
  "mailer_notifications_password_changed_enabled",
  "mailer_notifications_phone_changed_enabled",
  "mailer_otp_exp",
  "mailer_otp_length",
  "mailer_secure_email_change_enabled",
  "mailer_subjects_confirmation",
  "mailer_subjects_email_change",
  "mailer_subjects_email_changed_notification",
  "mailer_subjects_identity_linked_notification",
  "mailer_subjects_identity_unlinked_notification",
  "mailer_subjects_invite",
  "mailer_subjects_magic_link",
  "mailer_subjects_mfa_factor_enrolled_notification",
  "mailer_subjects_mfa_factor_unenrolled_notification",
  "mailer_subjects_password_changed_notification",
  "mailer_subjects_phone_changed_notification",
  "mailer_subjects_reauthentication",
  "mailer_subjects_recovery",
  "mailer_templates_confirmation_content",
  "mailer_templates_email_change_content",
  "mailer_templates_email_changed_notification_content",
  "mailer_templates_identity_linked_notification_content",
  "mailer_templates_identity_unlinked_notification_content",
  "mailer_templates_invite_content",
  "mailer_templates_magic_link_content",
  "mailer_templates_mfa_factor_enrolled_notification_content",
  "mailer_templates_mfa_factor_unenrolled_notification_content",
  "mailer_templates_password_changed_notification_content",
  "mailer_templates_phone_changed_notification_content",
  "mailer_templates_reauthentication_content",
  "mailer_templates_recovery_content",
] as const;
