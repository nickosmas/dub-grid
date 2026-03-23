"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            fontFamily: "'DM Sans', sans-serif",
            padding: 24,
          }}
        >
          <p style={{ fontSize: "var(--dg-fs-title)", color: "var(--color-text-muted)" }}>
            Something went wrong. Please refresh the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              background: "var(--color-brand)",
              color: "var(--color-text-inverse)",
              border: "none",
              borderRadius: 8,
              fontSize: "var(--dg-fs-body-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
