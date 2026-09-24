"use client";
import { User } from "lucide-react";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getImpersonationFromCookie,
  clearImpersonationCookie,
  type ImpersonationData,
} from "@/lib/impersonation";
import { endGridmasterImpersonation } from "@/features/gridmaster/client";
import { formatOrganizationRoleLabel } from "@/lib/client-facing";
import { markAuthTransition } from "@/lib/auth-transition";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";
import { ButtonLoading } from "@/components/ButtonSpinner";

const BANNER_HEIGHT = 40;

export default function ImpersonationBanner() {
  const queryClient = useQueryClient();
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
    const expiresAt = imp?.expiresAt;
    if (!expiresAt) {
      setCountdown(null);
      return;
    }
    function tick() {
      const diff = new Date(expiresAt!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown(null);
        clearImpersonationCookie();
        setImp(null);
        markAuthTransition();
        queryClient.clear();
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
  }, [imp?.expiresAt, queryClient]);

  async function handleEnd() {
    if (!imp || ending) return;
    setEnding(true);
    try {
      await endGridmasterImpersonation({
        sessionId: imp.sessionId,
        reason: "manual",
        targetOrgId: imp.targetOrgId,
      });
      // Best-effort email notification
      fetch("/api/notify-impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "end", sessionId: imp.sessionId }),
      }).catch(() => {});
    } catch {
      // Best-effort — cookie clear + redirect is what matters
    }
    clearImpersonationCookie();
    toast.success("Impersonation ended");
    // Mark the transition before anything else tears down: clearing the
    // cache mid-flight surfaced a transient null session that ProtectedRoute
    // answered with a bounce to /login on Firefox (F-73), and the mark holds
    // that guard until the portal document has taken over. The clear itself
    // stays, right before the load, so no prior-tenant state outlives it.
    markAuthTransition();
    queryClient.clear();
    window.location.replace("/dashboard");
  }

  if (!imp) return null;

  return (
    <div
      style={{
        height: BANNER_HEIGHT,
        background: "linear-gradient(135deg, var(--dg-color-danger), var(--dg-color-danger-dark))",
        color: "var(--dg-color-text-inverse)",
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
        <User size={16} strokeWidth={2.5} />
        Viewing <strong>{imp.targetOrgName || "organization"}</strong> as{" "}
        {formatOrganizationRoleLabel(imp.targetOrgRole).toLowerCase()} ({imp.targetEmail})
        {imp.justification && (
          <MaybeHint content={imp.justification} side="bottom">
            <span
              style={{
                fontSize: "var(--dg-fs-footnote, 11px)",
                maxWidth: 300,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              — {imp.justification}
            </span>
          </MaybeHint>
        )}
      </span>
      {countdown && (
        <span
          style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            background: "rgba(0,0,0,0.2)",
            borderRadius: "var(--dg-radius-sm)",
            padding: "2px 8px",
            fontSize: "var(--dg-fs-caption, 12px)",
          }}
        >
          {countdown}
        </span>
      )}
      <Button
        onClick={handleEnd}
        disabled={ending}
        style={{
          background: "rgba(255,255,255,0.2)",
          color: "var(--dg-color-text-inverse)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: "var(--dg-radius-sm)",
          padding: "4px 12px",
          fontSize: "var(--dg-fs-caption, 12px)",
          fontWeight: 700,
          cursor: ending ? "not-allowed" : "pointer",
          opacity: ending ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        <ButtonLoading loading={ending}>End Session</ButtonLoading>
      </Button>
    </div>
  );
}
