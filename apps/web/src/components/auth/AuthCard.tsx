"use client";

import Link from "next/link";
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

      <footer className="dg-auth-footer">
        <div className="dg-auth-footer-content">
          {signInDisclaimer ? (
            <span>
              By continuing, I agree to DubGrid&apos;s{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-sentence-link"
              >
                Terms of Service
              </Link>
              ,{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-sentence-link"
              >
                Privacy Policy
              </Link>
              , and{" "}
              <Link
                href="/cookie-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-sentence-link"
              >
                Cookie Policy
              </Link>
              .
            </span>
          ) : (
            <>
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-footer-link"
              >
                Privacy Policy
              </Link>
              <span className="dg-auth-footer-separator">·</span>
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="dg-auth-footer-link"
              >
                Terms of Service
              </Link>
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
