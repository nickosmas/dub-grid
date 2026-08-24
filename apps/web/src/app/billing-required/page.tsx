// H-2: this authed page receives the nonce CSP from middleware, so it must render
// dynamically (a static prerender can't carry the per-request nonce → broken
// hydration). Mirrors the other authed routes. See SECURITY_AUDIT.md F-4.
export const dynamic = "force-dynamic";

export default function BillingRequiredPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--color-bg)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-page-title)",
            lineHeight: 1.15,
            fontWeight: 800,
            color: "var(--color-text-primary)",
          }}
        >
          Organization unavailable
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-body)",
            lineHeight: 1.5,
            color: "var(--color-text-muted)",
            fontWeight: 600,
          }}
        >
          Your organization opens up once your administrator finishes setup.
        </p>
      </section>
    </main>
  );
}
