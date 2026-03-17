"use client";

import { useEffect, useRef, useState } from "react";

/**
 * GitHub-style top progress bar.
 *
 * When `loading` is true the bar quickly reaches ~30%, then trickles toward 90%.
 * When `loading` becomes false the bar fills to 100% and fades out.
 */
export default function ProgressBar({ loading }: { loading: boolean }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setWidth(30);

      trickleRef.current = setInterval(() => {
        setWidth((w) => {
          if (w >= 90) return w;
          // Slow down as we approach 90%
          const step = (90 - w) * 0.08;
          return Math.min(w + Math.max(step, 0.5), 90);
        });
      }, 300);
    } else if (visible) {
      // Finish: jump to 100%, then fade out
      if (trickleRef.current) clearInterval(trickleRef.current);
      setWidth(100);
      const fadeTimer = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 350);
      return () => clearTimeout(fadeTimer);
    }

    return () => {
      if (trickleRef.current) clearInterval(trickleRef.current);
    };
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "var(--color-accent, #2563EB)",
          boxShadow: "0 0 8px var(--color-accent, #2563EB)",
          transition:
            width === 100
              ? "width 200ms ease-out, opacity 150ms ease 200ms"
              : "width 300ms ease",
          opacity: width === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
