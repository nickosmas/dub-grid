"use client";
import { VenetianMask } from "lucide-react";

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
import { Banner } from "@/components/ui/Banner";

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
    <Banner
      icon={VenetianMask}
      layout="bar"
      tone="danger"
      action={
        <span className="flex items-center gap-3">
          {countdown && <span className="dg-tabular-nums font-semibold">{countdown}</span>}
          <Button
            onClick={handleEnd}
            disabled={ending}
            className="dg-btn dg-btn-secondary dg-btn-sm"
          >
            <ButtonLoading loading={ending}>End Session</ButtonLoading>
          </Button>
        </span>
      }
    >
      <span>
        Viewing <strong>{imp.targetOrgName || "organization"}</strong> as{" "}
        {formatOrganizationRoleLabel(imp.targetOrgRole).toLowerCase()} ({imp.targetEmail})
        {imp.justification && (
          <MaybeHint content={imp.justification} side="bottom">
            <span className="ml-1 inline-block max-w-[300px] truncate align-bottom text-[length:var(--dg-fs-footnote)]">
              — {imp.justification}
            </span>
          </MaybeHint>
        )}
      </span>
    </Banner>
  );
}
