"use client";

import * as Sentry from "@/lib/sentry";
import { Button } from "@/components/Button";
import { useEffect } from "react";

/**
 * The last-resort boundary: it replaces the root layout, so the stylesheet that
 * defines every `--color-*` token may not be applied here. Everything below is
 * therefore literal — a token would resolve to nothing and render invisible
 * text at the exact moment the app is already broken. The values mirror
 * `packages/design-tokens` (light and dark) so the fallback still looks like
 * DubGrid; keep them in sync if the brand palette moves.
 */
const FALLBACK_STYLES = `
  .dg-fatal { --bg: #FFFFFF; --fg: #0F172A; --muted: #475569; --brand: #2563EB; }
  @media (prefers-color-scheme: dark) {
    .dg-fatal { --bg: #02070F; --fg: #F1F1F3; --muted: #A1A1AA; --brand: #2075FF; }
  }
  .dg-fatal {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    background: var(--bg);
    color: var(--fg);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .dg-fatal h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .dg-fatal p { margin: 0; max-width: 420px; font-size: 15px; line-height: 1.5; color: var(--muted); }
  .dg-fatal button {
    margin-top: 8px;
    padding: 10px 20px;
    background: var(--brand);
    color: #FFFFFF;
    border: none;
    border-radius: 8px;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
`;

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
      <body suppressHydrationWarning style={{ margin: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: FALLBACK_STYLES }} />
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
