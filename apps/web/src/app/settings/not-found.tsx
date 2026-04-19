import Link from "next/link";

export default function SettingsNotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
      <p style={{ fontSize: "var(--dg-fs-page-title)", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>Settings page not found</p>
      <p style={{ fontSize: "var(--dg-fs-body)", color: "var(--color-text-muted)", margin: 0 }}>The settings page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/settings" className="dg-btn dg-btn-primary" style={{ marginTop: 8 }}>Back to Settings</Link>
    </div>
  );
}
