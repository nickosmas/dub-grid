/**
 * How long an invitation link works, from when it is sent or reissued. The
 * `invitations.expires_at` column default says the same in SQL, and a test
 * holds the two together.
 */
export const INVITATION_LIFETIME_HOURS = 72;
export const INVITATION_LIFETIME_MS = INVITATION_LIFETIME_HOURS * 60 * 60 * 1000;
