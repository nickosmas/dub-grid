/**
 * Password strength rules and match checking, shared by web and mobile.
 *
 * These lived in two places — mobile's auth lib and
 * `apps/web/src/components/auth/PasswordStrength.tsx` — as byte-level
 * duplicates that had already drifted in what they enforced: web gated on
 * `length >= 10` while mobile required strength level 2. Two apps, one product,
 * two different password bars. This is now the single source.
 *
 * Deliberately dependency-free string logic so it stays platform-neutral.
 */

// Supabase's `lower_upper_letters_digits_symbols` requirement refuses a password
// missing any of these, so the app asks for each rather than accept what the
// server then rejects. Its symbols are ASCII punctuation: a space, an accented
// letter or an emoji doesn't count.
export const PASSWORD_STRENGTH_RULES = [
  {
    id: "length",
    label: "At least 10 characters",
    isMet: (password: string) => password.length >= 10,
  },
  {
    id: "lowercase",
    label: "Lowercase letter",
    isMet: (password: string) => /[a-z]/.test(password),
  },
  {
    id: "uppercase",
    label: "Uppercase letter",
    isMet: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "Number",
    isMet: (password: string) => /[0-9]/.test(password),
  },
  {
    id: "symbol",
    label: "Symbol",
    isMet: (password: string) => /[!-/:-@[-`{-~]/.test(password),
  },
] as const;

export const PASSWORD_STRENGTH_LABELS = ["Too short", "Weak", "Strong"] as const;

/**
 * Supabase Auth refuses a password over 72 bytes (bcrypt's limit, counted as
 * UTF-8 in `internal/api/password.go`), so the app refuses it first (F-57).
 */
export const PASSWORD_MAX_BYTES = 72;

/** UTF-8 length, counted without TextEncoder so it runs the same everywhere. */
export function passwordByteLength(password: string): number {
  let bytes = 0;
  for (const char of password) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

const MAX_LENGTH_HINT = {
  id: "maxLength",
  label: "At most 72 characters, fewer with accents or emoji",
} as const;

export type PasswordStrengthHint = {
  id: string;
  label: string;
  met: boolean;
};

export function getPasswordStrengthHints(password: string): PasswordStrengthHint[] {
  const hints: PasswordStrengthHint[] = PASSWORD_STRENGTH_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.isMet(password),
  }));
  // Shown only when broken, so the usual list stays as short as it was.
  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) {
    hints.push({ ...MAX_LENGTH_HINT, met: false });
  }
  return hints;
}

/**
 * 0-2, indexing `PASSWORD_STRENGTH_LABELS`.
 *
 * Length gates everything: a short password is "too short" no matter how many
 * character classes it uses, because length is what actually resists a brute
 * force.
 */
export function getPasswordStrengthLevel(password: string): number {
  if (!getPasswordStrengthHints(password)[0]?.met) return 0;
  // Never "Strong" for a password the forms refuse (41d3, F-47).
  return isPasswordAcceptable(password) ? 2 : 1;
}

/** The bar a new password has to clear before any form will submit: every rule. */
export function isPasswordAcceptable(password: string): boolean {
  return getPasswordStrengthHints(password).every((hint) => hint.met);
}

/** One wording everywhere. Mobile reset previously said "Those passwords don't match." */
export const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match.";

export function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation;
}

/**
 * The live mismatch message for a confirm field, or null when there is nothing
 * to say yet.
 *
 * Stays quiet until the user has actually typed a confirmation, so the warning
 * appears as they diverge rather than the instant the field is focused.
 */
export function getPasswordMismatchError(password: string, confirmation: string): string | null {
  if (confirmation.length === 0) return null;
  return passwordsMatch(password, confirmation) ? null : PASSWORD_MISMATCH_MESSAGE;
}
