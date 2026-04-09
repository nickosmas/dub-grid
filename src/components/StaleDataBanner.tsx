"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

interface StaleDataBannerProps {
  /** Timestamp (ms) of the last successful data refetch */
  lastRefetchAt: number;
  /** Whether the realtime channel is in an error state */
  channelError: boolean;
  /** Called when the user clicks "Refresh now" */
  onRefresh: () => void;
  /** Staleness threshold in ms (default: 60 000) */
  threshold?: number;
}

export default function StaleDataBanner({
  lastRefetchAt,
  channelError,
  onRefresh,
  threshold = 60_000,
}: StaleDataBannerProps) {
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    function check() {
      setIsStale(
        channelError || (lastRefetchAt > 0 && Date.now() - lastRefetchAt > threshold),
      );
    }
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [lastRefetchAt, channelError, threshold]);

  if (!isStale) return null;

  return (
    <div
      role="alert"
      className="dg-draft-banner no-print"
      style={{
        background: "var(--color-warning-bg, #fef3cd)",
        borderColor: "var(--color-warning-border, #ffc107)",
        color: "var(--color-warning-text, #856404)",
      }}
    >
      <div
        className="dg-draft-banner-dot"
        style={{ background: "var(--color-warning-text, #856404)" }}
      />
      <span>
        {channelError
          ? "Live updates disconnected"
          : "Schedule data may be out of date"}
      </span>
      <div className="dg-draft-banner-actions">
        <button
          onClick={onRefresh}
          className="dg-btn dg-btn-secondary dg-btn-sm"
        >
          <RefreshCw size={12} style={{ marginRight: 4 }} />
          Refresh now
        </button>
      </div>
    </div>
  );
}
