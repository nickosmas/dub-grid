"use client";

import Link from "next/link";
import { openConsentPreferences } from "@/components/CookieConsent";

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
  const linkStyle = { color: "inherit", textDecoration: "underline" };

  return (
    <div className="dg-auth-shell">
      {children}

      <footer
        style={{
          marginTop: "36px",
          width: "100%",
          maxWidth: "860px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 8px",
          fontSize: "var(--dg-fs-label)",
          color: "var(--color-text-faint)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "4px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {signInDisclaimer ? (
            <span>
              By continuing, I agree to DubGrid&apos;s{" "}
              <Link href="/terms" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                Terms of Service
              </Link>
              ,{" "}
              <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                Privacy Policy
              </Link>
              , and{" "}
              <Link
                href="/cookie-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                Cookie Policy
              </Link>
              .
            </span>
          ) : (
            <>
              <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                Privacy Policy
              </Link>
              <span style={{ margin: "0 4px" }}>·</span>
              <Link href="/terms" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                Terms of Service
              </Link>
              <span style={{ margin: "0 4px" }}>·</span>
              <button
                type="button"
                onClick={openConsentPreferences}
                style={{
                  color: "var(--color-text-faint)",
                  textDecoration: "none",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                Cookie preferences
              </button>
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
