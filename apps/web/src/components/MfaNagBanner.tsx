"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePermissions } from "@/hooks";
import { Button } from "@/components/Button";

const BANNER_HEIGHT = 36;
const DISMISS_KEY = "dg_mfa_nag_dismissed";

export default function MfaNagBanner() {
  const { mfaNagRequired } = usePermissions();
  const [dismissed, setDismissed] = useState(true);

  // Read from sessionStorage after mount only — dismissal is meant to last
  // for this browser session, not forever, so a fresh login re-shows it.
  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!mfaNagRequired || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      style={{
        height: BANNER_HEIGHT,
        background: "linear-gradient(135deg, #f59e0b, #d97706)",
        color: "#fff",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontSize: "var(--dg-fs-label, 13px)",
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        textAlign: "center",
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Your account doesn&apos;t have two-factor authentication enabled.
      <Link
        href="/profile?section=security"
        style={{ color: "#fff", textDecoration: "underline", fontWeight: 700 }}
      >
        Set it up
      </Link>
      <Button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "rgba(255,255,255,0.2)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 6,
          padding: "2px 10px",
          fontSize: "var(--dg-fs-caption, 12px)",
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
