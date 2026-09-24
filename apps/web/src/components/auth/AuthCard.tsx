"use client";

import { openConsentPreferences } from "@/components/CookieConsent";
import { Button } from "@/components/Button";

export function PageShell({
  children,
  signInDisclaimer = false,
}: {
  children: React.ReactNode;
  /** Swap the Privacy Policy / Terms of Service links for the full
   * "By continuing, I agree to..." sign-in disclaimer — used on the login
   * pages instead of the bare links shown everywhere else. */
  signInDisclaimer?: boolean;
}) {
  return (
    <div className="dg-auth-shell">
      {children}

      {/* Legal documents open in a new tab and may redirect to the apex.
          Native links avoid cross-origin RSC prefetches from login pages. */}
      <footer className="dg-auth-footer">
        <div className="dg-auth-footer-content">
          {signInDisclaimer ? (
            <span>
              By continuing, I agree to DubGrid&apos;s{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-sentence-link"
              >
                Terms of Service
              </a>
              ,{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-sentence-link"
              >
                Privacy Policy
              </a>
              , and{" "}
              <a
                href="/cookie-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-sentence-link"
              >
                Cookie Policy
              </a>
              .
            </span>
          ) : (
            <>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-footer-link"
              >
                Privacy Policy
              </a>
              <span className="dg-auth-footer-separator">·</span>
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-footer-link"
              >
                Terms of Service
              </a>
              <span className="dg-auth-footer-separator">·</span>
              <Button
                type="button"
                onClick={openConsentPreferences}
                className="dg-auth-footer-link dg-auth-footer-button"
              >
                Cookie preferences
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

type CardProps = Omit<React.ComponentPropsWithoutRef<"div">, "className">;

/**
 * Markers such as `data-testid` go on the card itself. A wrapper div around
 * it shrink-wraps under the shell's centered flex column and quietly narrows
 * the card below its 440px contract.
 */
export function Card({ children, ...rest }: CardProps) {
  return (
    <div className="dg-auth-card" {...rest}>
      {children}
    </div>
  );
}
