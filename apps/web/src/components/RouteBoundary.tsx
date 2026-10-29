"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SERVICE_STATUS_URL } from "@dubgrid/domain";
import * as Sentry from "@/lib/sentry";
import { Button } from "@/components/Button";
import { DubGridLogo } from "@/components/Logo";

const shellStyle = {
  minHeight: "calc(100dvh - var(--dg-app-shell-header-height))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column" as const,
  gap: 16,
  padding: 24,
  textAlign: "center" as const,
  fontFamily: "var(--font-sans)",
};

const titleStyle = {
  fontSize: "var(--dg-type-page-title-size)",
  fontWeight: 700,
  color: "var(--dg-color-text-primary)",
  margin: 0,
};

const statusLinkStyle = {
  fontSize: "var(--dg-fs-body)",
  color: "var(--dg-color-link)",
  textDecoration: "underline",
};

const bodyStyle = {
  fontSize: "var(--dg-fs-body)",
  color: "var(--dg-color-text-muted)",
  margin: 0,
  maxWidth: 480,
};

export function ErrorBoundary({
  error,
  reset,
  title = "This page didn't load",
  message = "If trying again doesn't help, refresh the page.",
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
        <Button onClick={reset} className="dg-btn dg-btn-primary">
          Try again
        </Button>
      </div>
      <a
        href={SERVICE_STATUS_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={statusLinkStyle}
      >
        Check service status
      </a>
    </div>
  );
}

export function NotFoundBoundary({
  title = "Page not found",
  message,
  backHref = "/",
  backLabel = "Go home",
}: {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  // Home is canonical on the apex, so it can cross origins from an app
  // subdomain. Navigate as a document instead of prefetching it as RSC.
  const BackLink = backHref === "/" ? "a" : Link;
  return (
    <div style={shellStyle}>
      <DubGridLogo size={48} />
      <p style={titleStyle}>{title}</p>
      <p style={bodyStyle}>{message ?? "The link may be old or mistyped."}</p>
      <BackLink href={backHref} className="dg-btn dg-btn-primary" style={{ marginTop: 8 }}>
        {backLabel}
      </BackLink>
    </div>
  );
}
