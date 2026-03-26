"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getImpersonationFromCookie,
  clearImpersonationCookie,
  type ImpersonationData,
} from "@/lib/impersonation";
import { endImpersonation } from "@/lib/db";
import { clearPermsCache } from "@/hooks/usePermissions";
import { clearOrgDataCache } from "@/hooks/useOrganizationData";

const BANNER_HEIGHT = 40;

export default function ImpersonationBanner() {
  const [imp, setImp] = useState<ImpersonationData | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  // Read cookie on mount and periodically re-check
  useEffect(() => {
    function check() {
      try {
        setImp(getImpersonationFromCookie(document.cookie));
      } catch {
        setImp(null);
      }
    }
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!imp?.expiresAt) {
      setCountdown(null);
      return;
    }
    function tick() {
      const diff = new Date(imp!.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown(null);
        clearImpersonationCookie();
        clearPermsCache();
        clearOrgDataCache();
        setImp(null);
        window.location.replace("/dashboard");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${String(secs).padStart(2, "0")}`);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [imp?.expiresAt]);

  async function handleEnd() {
    if (!imp || ending) return;
    setEnding(true);
    try {
      await endImpersonation(imp.sessionId, "manual");
      // Best-effort email notification
      fetch("/api/notify-impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: imp.targetEmail,
          targetOrgName: imp.targetOrgName,
          type: "end",
          sessionId: imp.sessionId,
        }),
      }).catch(() => {});
    } catch {
      // Best-effort — cookie clear + redirect is what matters
    }
    clearImpersonationCookie();
    clearPermsCache();
    clearOrgDataCache();
    toast.success("Impersonation ended");
    window.location.replace("/dashboard");
  }

  if (!imp) return null;

  return (
    <>
      {/* Fixed banner pinned to the top of the viewport */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: BANNER_HEIGHT,
          zIndex: 9999,
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          color: "#fff",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontSize: "var(--dg-fs-label, 13px)",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Impersonating{" "}
          <strong>{imp.targetEmail}</strong>
          {imp.targetOrgName && (
            <span style={{ opacity: 0.85 }}>({imp.targetOrgName})</span>
          )}
          {imp.justification && (
            <span
              style={{ opacity: 0.85, fontSize: "var(--dg-fs-footnote, 11px)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={imp.justification}
            >
              — {imp.justification}
            </span>
          )}
        </span>
        {countdown && (
          <span
            style={{
              fontFamily: "var(--font-dm-mono, monospace)",
              background: "rgba(0,0,0,0.2)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: "var(--dg-fs-caption, 12px)",
            }}
          >
            {countdown}
          </span>
        )}
        <button
          onClick={handleEnd}
          disabled={ending}
          style={{
            background: "rgba(255,255,255,0.2)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: "var(--dg-fs-caption, 12px)",
            fontWeight: 700,
            cursor: ending ? "not-allowed" : "pointer",
            opacity: ending ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {ending ? "Ending..." : "End Session"}
        </button>
      </div>
      {/* Spacer so page content isn't hidden under the fixed banner */}
      <div style={{ height: BANNER_HEIGHT }} />
    </>
  );
}
