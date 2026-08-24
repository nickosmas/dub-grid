"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
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
  muted,
  isLast,
}: {
  session: UserSession;
  onRevoke: (session: UserSession) => void;
  revoking: boolean;
  showRevoke: boolean;
  muted: boolean;
  isLast: boolean;
}) {
  const device = parseDeviceLabel(session.deviceLabel, session.platform);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--color-border-light)",
        opacity: muted ? 0.65 : 1,
      }}
    >
      <div style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
        {device.icon === "mobile" ? <Smartphone size={17} /> : <Monitor size={17} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "var(--dg-fs-caption)",
            fontWeight: muted ? 500 : 600,
            color: "var(--color-text-primary)",
          }}
        >
          {device.label}
          {session.isCurrent && (
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--color-text-inverse)",
                background: "var(--color-brand)",
                padding: "1px 7px",
                borderRadius: 999,
                lineHeight: 1.5,
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
          Last active {formatDateTime(session.lastActiveAt)}
        </div>
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-subtle)",
            marginTop: 2,
          }}
        >
          {session.ipAddress === "::1" ? "localhost" : (session.ipAddress ?? "Unknown IP")}
        </div>
      </div>
      {showRevoke && (
        <Button
          onClick={() => onRevoke(session)}
          disabled={revoking}
          className="dg-btn dg-btn-ghost dg-btn-xs"
          style={{ color: "var(--color-danger)", flexShrink: 0 }}
        >
          <ButtonLoading loading={revoking} loadingLabel="Signing out" spinnerSize={14}>
            Sign out
          </ButtonLoading>
        </Button>
      )}
    </div>
  );
}

function SectionHeading({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "var(--color-bg-secondary)",
        borderBottom: "1px solid var(--color-border-light)",
      }}
    >
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 700,
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {children}
      </span>
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 600,
          color: "var(--color-text-subtle)",
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {count}
      </span>
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
      toast.error("We couldn't load your devices. Refresh and try again.");
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
      toast.error("We couldn't sign out that device. Try again.");
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

  const emptyStateBoxStyle = {
    padding: "24px 16px",
    textAlign: "center" as const,
    color: "var(--color-text-muted)",
    fontSize: "var(--dg-fs-label)",
    borderRadius: "var(--dg-radius-md)",
    border: "1px solid var(--color-border-light)",
    background: "var(--color-surface)",
  };

  if (loading) {
    return <div style={emptyStateBoxStyle}>Loading sessions...</div>;
  }

  if (active.length === 0 && stale.length === 0) {
    return <div style={emptyStateBoxStyle}>No active sessions</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {active.length > 0 && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border-light)",
            background: "var(--color-surface)",
          }}
        >
          <SectionHeading count={active.length}>Active sessions</SectionHeading>
          {active.map((session, index) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={revokingId === session.id}
              showRevoke
              muted={false}
              isLast={index === active.length - 1}
            />
          ))}
        </div>
      )}
      {stale.length > 0 && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border-light)",
            background: "var(--color-surface)",
          }}
        >
          <SectionHeading count={stale.length}>Stale sessions</SectionHeading>
          {stale.map((session, index) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={false}
              showRevoke={false}
              muted
              isLast={index === stale.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
