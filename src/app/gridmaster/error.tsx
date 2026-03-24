"use client";

import { useEffect } from "react";

export default function GridmasterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Gridmaster page error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        padding: 24,
      }}
    >
      <p style={{ fontSize: "var(--dg-fs-title)", color: "var(--color-text-muted)" }}>
        Something went wrong loading this page.
      </p>
      <button onClick={reset} className="dg-btn dg-btn-primary">
        Try again
      </button>
    </div>
  );
}
