"use client";

import Link from "next/link";
import { openConsentPreferences } from "@/components/CookieConsent";

export function PageShell({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-text-faint)", textDecoration: "none" }}
          >
            Privacy Policy
          </Link>
          <span style={{ margin: "0 4px" }}>·</span>
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-text-faint)", textDecoration: "none" }}
          >
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
        </div>
      </footer>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="dg-auth-card">{children}</div>;
}
