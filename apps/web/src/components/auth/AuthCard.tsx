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

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="dg-auth-card">{children}</div>;
}
