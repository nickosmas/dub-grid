import type { Metadata } from "next";
import Link from "next/link";
import TermsContent from "./TermsContent";

export const revalidate = 86400; // 24 hours

export const metadata: Metadata = {
  title: "Terms of Service | DubGrid",
};

// Scope: written for the US market, governed by the laws of the State of
// Delaware. If DubGrid begins serving EU/UK users, add the corresponding
// consumer and data-protection terms.
//
// Body content lives in `TermsContent.tsx` so the standalone /accept-terms
// page can render the same prose inside its scroll-to-bottom acceptance UI.
export default function TermsOfServicePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dg-color-surface)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "var(--dg-color-text-primary)",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "32px",
            color: "var(--dg-color-text-subtle)",
            fontSize: "var(--dg-fs-body-sm)",
            textDecoration: "none",
          }}
        >
          ← Back to DubGrid
        </Link>

        <h1
          style={{
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Terms of Service
        </h1>

        <TermsContent />
      </div>
    </div>
  );
}
