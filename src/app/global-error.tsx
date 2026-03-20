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
          <p style={{ fontSize: 18, color: "#475569" }}>
            Something went wrong. Please refresh the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              background: "#1B3A2D",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
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
