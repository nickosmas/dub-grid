"use client";

import { SERVICE_STATUS_URL } from "@dubgrid/domain";
import * as Sentry from "@/lib/sentry";
import { Button } from "@/components/Button";
import { useEffect } from "react";
import "./global-error.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="dg-fatal">
          <h1>This page didn&apos;t load</h1>
          <p>If trying again doesn&apos;t help, refresh the page.</p>
          <Button onClick={reset}>Try again</Button>
          <a href={SERVICE_STATUS_URL} target="_blank" rel="noopener noreferrer">
            Check service status
          </a>
        </div>
      </body>
    </html>
  );
}
