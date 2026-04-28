import Link from "next/link";

export default function StaffNotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <p style={{ fontSize: "var(--dg-fs-page-title)", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>Page not found</p>
      <p style={{ fontSize: "var(--dg-fs-body)", color: "var(--color-text-muted)", margin: 0 }}>The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/people" className="dg-btn dg-btn-primary" style={{ marginTop: 8 }}>Back to People</Link>
    </div>
  );
}
