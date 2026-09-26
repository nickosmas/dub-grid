/**
 * Digits in an emailed one-time code, such as the recovery code the mobile app
 * asks for. It must equal `otp_length` in `[auth.email]` of
 * `supabase/config.toml`; a test holds the two together.
 */
export const EMAIL_OTP_LENGTH = 6;

/** Digits in an authenticator (TOTP) code, fixed by the TOTP standard. */
export const TOTP_CODE_LENGTH = 6;
