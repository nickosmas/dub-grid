"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Monitor, Smartphone } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchAccountSessions,
  getBrowserAuthSession,
  revokeAccountSession,
} from "@/features/account/client";
import { useLogout } from "@/hooks/useLogout";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { queryKeys } from "@/lib/query-keys";

interface UserSession {
  id: string;
  supabaseSessionId: string | null;
  platform: "web" | "ios" | "android" | null;
  appVersion: string | null;
  deviceLabel: string;
  browserName: string | null;
  browserVersion: string | null;
  ipAddress: string | null;
  locationCity: string | null;
  locationCountry: string | null;
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

function formatSessionClient(session: UserSession): string {
  if (session.platform === "web") {
    return [session.browserName, session.browserVersion].filter(Boolean).join(" ") || "Web browser";
  }

  return ["DubGrid Mobile", session.appVersion].filter(Boolean).join(" ");
}

function formatSessionLocation(session: UserSession): string {
  const ipAddress = session.ipAddress === "::1" ? "localhost" : (session.ipAddress ?? "Unknown IP");
  const location = [session.locationCity, session.locationCountry].filter(Boolean).join(", ");
  return location ? `${ipAddress} (${location})` : ipAddress;
}

function formatLastActive(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    date,
  );
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const dayDifference = Math.round((startOf(now).getTime() - startOf(date).getTime()) / 86_400_000);

  if (dayDifference === 0) return `Today at ${time}`;
  if (dayDifference === 1) return `Yesterday at ${time}`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
        borderBottom: isLast ? "none" : "1px solid var(--dg-color-border-light)",
        opacity: muted ? 0.65 : 1,
      }}
    >
      <div style={{ color: "var(--dg-color-text-muted)", flexShrink: 0 }}>
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
            color: "var(--dg-color-text-primary)",
          }}
        >
          {device.label}
          {session.isCurrent && (
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--dg-color-text-inverse)",
                background: "var(--dg-color-brand)",
                padding: "1px 7px",
                borderRadius: 999,
                lineHeight: 1.5,
              }}
            >
              This device
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-muted)",
            marginTop: 2,
          }}
        >
          {formatSessionClient(session)}
        </div>
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-subtle)",
            marginTop: 2,
          }}
        >
          {formatSessionLocation(session)}
        </div>
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-subtle)",
            marginTop: 2,
          }}
        >
          {formatLastActive(session.lastActiveAt)}
        </div>
      </div>
      {showRevoke && (
        <Button
          onClick={() => onRevoke(session)}
          disabled={revoking}
          className="dg-btn dg-btn-ghost dg-btn-xs"
          style={{ color: "var(--dg-color-danger)", flexShrink: 0 }}
        >
          <ButtonLoading loading={revoking} spinnerSize={14}>
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
        background: "var(--dg-color-bg-secondary)",
        borderBottom: "1px solid var(--dg-color-border-light)",
      }}
    >
      <span className="dg-type-content-group-heading">{children}</span>
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 600,
          color: "var(--dg-color-text-subtle)",
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {count}
      </span>
    </div>
  );
}

export function SessionList({
  onOtherSessionCountChange,
}: {
  onOtherSessionCountChange?: (count: number) => void;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { signOut } = useLogout();
  const stepUp = useStepUpAction();
  const [confirmCurrentSessionSignOut, setConfirmCurrentSessionSignOut] = useState(false);

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
        appVersion: row.appVersion,
        deviceLabel: row.deviceLabel ?? "Unknown device",
        browserName: row.browserName,
        browserVersion: row.browserVersion,
        ipAddress: row.ipAddress,
        locationCity: row.locationCity,
        locationCountry: row.locationCountry,
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

  useEffect(() => {
    if (!sessionsQuery.data) return;
    onOtherSessionCountChange?.(active.filter((session) => !session.isCurrent).length);
  }, [active, onOtherSessionCountChange, sessionsQuery.data]);

  const revokeMutation = useMutation({
    mutationFn: async (session: UserSession) => ({
      session,
      completed: await stepUp.run((accessToken) =>
        revokeAccountSession(session.refreshTokenHash, accessToken),
      ),
    }),
    onSuccess: ({ session, completed }) => {
      if (!completed) return;
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
    onSettled: () => {
      // Password confirmation may replace this session even if the action was cancelled or failed.
      if (user)
        void queryClient.invalidateQueries({ queryKey: queryKeys.account.sessions(user.id) });
    },
  });
  const revokingId = revokeMutation.isPending ? (revokeMutation.variables?.id ?? null) : null;

  function handleRevoke(session: UserSession) {
    if (session.isCurrent) {
      setConfirmCurrentSessionSignOut(true);
      return;
    }
    revokeMutation.mutate(session);
  }

  const emptyStateBoxStyle = {
    padding: "24px 16px",
    textAlign: "center" as const,
    color: "var(--dg-color-text-muted)",
    fontSize: "var(--dg-fs-label)",
    borderRadius: "var(--dg-radius-md)",
    border: "1px solid var(--dg-color-border-light)",
    background: "var(--dg-color-surface)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {stepUp.dialog}
      {loading && <div style={emptyStateBoxStyle}>Loading sessions...</div>}
      {!loading && active.length === 0 && stale.length === 0 && (
        <div style={emptyStateBoxStyle}>No active sessions</div>
      )}
      {!loading && active.length > 0 && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--dg-color-border-light)",
            background: "var(--dg-color-surface)",
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
      {!loading && stale.length > 0 && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--dg-color-border-light)",
            background: "var(--dg-color-surface)",
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
      {confirmCurrentSessionSignOut && (
        <ConfirmDialog
          title="Sign out this device?"
          message="You will need to sign in again to use DubGrid on this device."
          confirmLabel="Sign out"
          onConfirm={() => signOut({ scope: "local" })}
          onCancel={() => setConfirmCurrentSessionSignOut(false)}
        />
      )}
    </div>
  );
}
