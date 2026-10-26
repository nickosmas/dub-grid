"use client";

import { usePermissions } from "@/hooks";

const BANNER_HEIGHT = 36;

export default function InactiveAccountBanner() {
  const { isInactive } = usePermissions();

  if (!isInactive) return null;

  // A calm notice, not a warning: being away isn't something to fix.
  return (
    <div
      role="status"
      style={{
        height: BANNER_HEIGHT,
        background: "var(--dg-color-info-bg)",
        borderBottom: "1px solid var(--dg-color-info-border)",
        color: "var(--dg-color-info-text)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--dg-fs-label, 13px)",
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      You&apos;re away.
    </div>
  );
}
