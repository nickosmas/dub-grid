import Link from "next/link";

export default function GridmasterNotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <p style={{ fontSize: "var(--dg-fs-page-title)", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>Page not found</p>
      <p style={{ fontSize: "var(--dg-fs-body)", color: "var(--color-text-muted)", margin: 0 }}>The Gridmaster page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/gridmaster" className="dg-btn dg-btn-primary" style={{ marginTop: 8 }}>Back to Command Center</Link>
    </div>
  );
}
