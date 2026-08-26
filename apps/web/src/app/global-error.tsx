"use client";

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
          <h1>Something went wrong</h1>
          <p>
            We couldn&apos;t load DubGrid. Try again, and refresh the page if it keeps happening.
          </p>
          <Button onClick={reset}>Try Again</Button>
        </div>
      </body>
    </html>
  );
}
