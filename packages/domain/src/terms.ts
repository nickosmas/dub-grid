/**
 * The Terms of Service version users must have accepted to use the product.
 *
 * Lives here rather than in `apps/web` because both the web app and the mobile
 * app gate on it: bumping this re-prompts every user on every platform. A
 * user's accepted version is stored on `profiles.terms_version`.
 */
export const CURRENT_TERMS_VERSION = "1.0.0";

export interface TermsAcceptanceStatus {
  acceptedCurrentTerms: boolean;
  acceptedVersion: string | null;
}

/** Whether a stored accepted version satisfies the current requirement. */
export function hasAcceptedCurrentTerms(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion === CURRENT_TERMS_VERSION;
}
