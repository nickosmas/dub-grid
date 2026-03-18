"use client";

import { useEffect } from "react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Settings page error:", error);
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
      <p style={{ fontSize: 16, color: "#475569" }}>
        Something went wrong loading this page.
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
  );
}
