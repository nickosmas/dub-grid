import Link from "next/link";
import { DubGridLogo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <DubGridLogo size={48} />
      <p
        style={{
          fontSize: "var(--dg-fs-page-title)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: 0,
        }}
      >
        404
      </p>
      <p
        style={{
          fontSize: "var(--dg-fs-title)",
          color: "var(--color-text-muted)",
          margin: 0,
          textAlign: "center",
        }}
      >
        This page could not be found.
      </p>
      <Link
        href="/"
        className="dg-btn dg-btn-primary"
        style={{ marginTop: 8 }}
      >
        Go Home
      </Link>
    </div>
  );
}
