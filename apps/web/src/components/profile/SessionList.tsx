"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Monitor, Smartphone } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchAccountSessions,
  getBrowserAuthSession,
  revokeAccountSession,
} from "@/features/account/client";
import { useLogout } from "@/hooks/useLogout";
import { queryKeys } from "@/lib/query-keys";

interface UserSession {
  id: string;
  supabaseSessionId: string | null;
  platform: "web" | "ios" | "android" | null;
  deviceLabel: string;
  ipAddress: string | null;
  lastActiveAt: string;
  refreshTokenHash: string;
  isCurrent: boolean;
}

interface SessionOverview {
  active: UserSession[];
  stale: UserSession[];
}

function parseDeviceLabel(
  label: string,
  platform: UserSession["platform"],
): { icon: "mobile" | "desktop"; label: string } {
  if (platform === "ios" || platform === "android") {
    return { icon: "mobile", label };
  }

  const lower = label.toLowerCase();
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
    return { icon: "mobile", label };
  }
  return { icon: "desktop", label };
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Active now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function extractSupabaseSessionId(accessToken: string): string | null {
  try {
    const [, encodedPayload] = accessToken.split(".");
    if (!encodedPayload) return null;

    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const payload = JSON.parse(atob(`${normalized}${padding}`)) as Record<string, unknown>;
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

function SessionRow({
  session,
  onRevoke,
  revoking,
  showRevoke,
}: {
  session: UserSession;
  onRevoke: (session: UserSession) => void;
  revoking: boolean;
  showRevoke: boolean;
}) {
  const device = parseDeviceLabel(session.deviceLabel, session.platform);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: session.isCurrent ? "var(--color-brand-bg)" : "transparent",
        borderBottom: "1px solid var(--color-border-light)",
      }}
    >
      <div style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
        {device.icon === "mobile" ? <Smartphone size={18} /> : <Monitor size={18} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {device.label}
          {session.isCurrent && (
            <span
              style={{
                marginLeft: 8,
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--color-brand)",
                background: "var(--color-brand-bg)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              Current
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          {session.ipAddress === "::1" ? "localhost" : (session.ipAddress ?? "Unknown IP")}{" "}
          &middot; {formatRelative(session.lastActiveAt)}
        </div>
      </div>
      {showRevoke && (
        <button
          onClick={() => onRevoke(session)}
          disabled={revoking}
          className="dg-btn dg-btn-ghost dg-btn-xs"
          style={{ color: "var(--color-danger)" }}
        >
          <ButtonLoading loading={revoking} spinnerSize={14}>
            Sign out
          </ButtonLoading>
        </button>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 700,
        color: "var(--color-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: "var(--color-bg-secondary)",
        borderBottom: "1px solid var(--color-border-light)",
      }}
    >
      {children}
    </div>
  );
}

export function SessionList() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { signOut } = useLogout();

  const sessionsQuery = useQuery({
    queryKey: user ? queryKeys.account.sessions(user.id) : ["account", "anon", "sessions"],
    queryFn: async (): Promise<SessionOverview> => {
      const { active, stale } = await fetchAccountSessions();
      const currentSession = await getBrowserAuthSession();
      const currentSupabaseSessionId = currentSession?.access_token
        ? extractSupabaseSessionId(currentSession.access_token)
        : null;

      const toUserSession = (row: (typeof active)[number]): UserSession => ({
        id: row.id,
        supabaseSessionId: row.supabaseSessionId,
        platform: row.platform,
        deviceLabel: row.deviceLabel ?? "Unknown device",
        ipAddress: row.ipAddress,
        lastActiveAt: row.lastActiveAt,
        refreshTokenHash: row.refreshTokenHash,
        isCurrent:
          currentSupabaseSessionId != null && row.supabaseSessionId === currentSupabaseSessionId,
      });

      return {
        active: active.map(toUserSession),
        stale: stale.map(toUserSession),
      };
    },
    enabled: !authLoading && !!user,
  });

  useEffect(() => {
    if (sessionsQuery.isError) {
      toast.error("Failed to load sessions");
    }
  }, [sessionsQuery.isError]);

  const active = sessionsQuery.data?.active ?? [];
  const stale = sessionsQuery.data?.stale ?? [];
  const loading = authLoading || sessionsQuery.isPending;

  const revokeMutation = useMutation({
    mutationFn: (session: UserSession) =>
      revokeAccountSession(session.refreshTokenHash).then(() => session),
    onSuccess: (session) => {
      if (user) {
        queryClient.setQueryData<SessionOverview>(queryKeys.account.sessions(user.id), (prev) =>
          prev ? { ...prev, active: prev.active.filter((s) => s.id !== session.id) } : prev,
        );
      }
      toast.success("Session revoked");
    },
    onError: () => {
      toast.error("Failed to revoke session");
    },
  });
  const revokingId = revokeMutation.isPending ? (revokeMutation.variables?.id ?? null) : null;

  function handleRevoke(session: UserSession) {
    if (session.isCurrent) {
      signOut({ scope: "local" });
      return;
    }
    revokeMutation.mutate(session);
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)",
        }}
      >
        Loading sessions...
      </div>
    );
  }

  if (active.length === 0 && stale.length === 0) {
    return (
      <div
        style={{
          padding: "24px 16px",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)",
        }}
      >
        No active sessions
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {active.length > 0 && (
        <>
          <SectionHeading>Active sessions</SectionHeading>
          {active.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={revokingId === session.id}
              showRevoke
            />
          ))}
        </>
      )}
      {stale.length > 0 && (
        <>
          <SectionHeading>Stale sessions</SectionHeading>
          {stale.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={false}
              showRevoke={false}
            />
          ))}
        </>
      )}
    </div>
  );
}
