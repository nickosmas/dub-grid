"use client";

import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@/lib/sentry";
import { DubGridLogo } from "@/components/Logo";

const shellStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column" as const,
  gap: 16,
  padding: 24,
  textAlign: "center" as const,
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
};

const titleStyle = {
  fontSize: "var(--dg-fs-page-title)",
  fontWeight: 700,
  color: "var(--color-text-primary)",
  margin: 0,
};

const bodyStyle = {
  fontSize: "var(--dg-fs-body)",
  color: "var(--color-text-muted)",
  margin: 0,
  maxWidth: 480,
};

export function ErrorBoundary({
  error,
  reset,
  title = "Something went wrong",
  message = "We couldn't load this page. Try again or head back home.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  message?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={shellStyle}>
      <DubGridLogo size={48} />
      <p style={titleStyle}>{title}</p>
      <p style={bodyStyle}>{message}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={reset} className="dg-btn dg-btn-primary">
          Try again
        </button>
      </div>
    </div>
  );
}

export function NotFoundBoundary({
  title = "Page not found",
  message,
  backHref = "/",
  backLabel = "Go Home",
}: {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div style={shellStyle}>
      <DubGridLogo size={48} />
      <p style={titleStyle}>{title}</p>
      <p style={bodyStyle}>
        {message ?? "The page you're looking for doesn't exist."}
      </p>
      <Link href={backHref} className="dg-btn dg-btn-primary" style={{ marginTop: 8 }}>
        {backLabel}
      </Link>
    </div>
  );
}
