"use client";

import Link from "next/link";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";

export function PageShell({
  children,
  footerCenteredOnly,
}: {
  children: React.ReactNode;
  footerCenteredOnly?: boolean;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        padding: "24px 16px",
      }}
    >
      {children}

      <footer
        style={{
          marginTop: "36px",
          width: "100%",
          maxWidth: "860px",
          display: "flex",
          alignItems: "center",
          justifyContent: footerCenteredOnly ? "center" : "space-between",
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
        </div>
        {!footerCenteredOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <DubGridLogo size={20} />
            <DubGridWordmark fontSize={14} color="var(--color-text-subtle)" />
          </div>
        )}
      </footer>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="dg-auth-card">{children}</div>;
}
