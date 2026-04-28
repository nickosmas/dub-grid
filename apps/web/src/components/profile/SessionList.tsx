"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Monitor, Smartphone, Trash2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchAccountSessions,
  revokeAccountSession,
} from "@/features/account/client";

interface UserSession {
  id: string;
  deviceLabel: string;
  ipAddress: string | null;
  lastActiveAt: string;
  refreshTokenHash: string;
  isCurrent: boolean;
}

function parseDeviceLabel(label: string): { icon: "mobile" | "desktop"; label: string } {
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

export function SessionList() {
  const { user, isLoading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    setLoading(true);

    try {
      if (!user) {
        setSessions([]);
        return;
      }

      const rows = (await fetchAccountSessions()).sessions;

      // Match current session using the stable per-browser session ID (same as AuthProvider)
      let currentHash = "";
      const storageKey = `dg_session_id:${user.id}`;
      const sessionId = localStorage.getItem(storageKey);
      if (sessionId) {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sessionId));
        currentHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }

      setSessions(
        rows.map((row) => ({
          id: row.id,
          deviceLabel: row.deviceLabel ?? "Unknown device",
          ipAddress: row.ipAddress,
          lastActiveAt: row.lastActiveAt,
          refreshTokenHash: row.refreshTokenHash,
          isCurrent: currentHash !== "" && row.refreshTokenHash === currentHash,
        })),
      );
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function handleRevoke(session: UserSession) {
    setRevokingId(session.id);
    try {
      await revokeAccountSession(session.refreshTokenHash);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      toast.success("Session revoked");
    } catch {
      toast.error("Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
        No active sessions
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sessions.map((s) => {
        const device = parseDeviceLabel(s.deviceLabel);
        return (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: s.isCurrent ? "var(--color-brand-bg)" : "transparent",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <div style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
              {device.icon === "mobile" ? <Smartphone size={18} /> : <Monitor size={18} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {device.label}
                {s.isCurrent && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 700,
                    color: "var(--color-brand)",
                    background: "var(--color-brand-bg)",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}>
                    Current
                  </span>
                )}
              </div>
              <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", marginTop: 2 }}>
                {s.ipAddress === "::1" ? "localhost" : s.ipAddress ?? "Unknown IP"} &middot; {formatRelative(s.lastActiveAt)}
              </div>
            </div>
            {!s.isCurrent && (
              <button
                onClick={() => handleRevoke(s)}
                disabled={revokingId === s.id}
                className="dg-btn dg-btn-ghost dg-btn-xs"
                style={{ color: "var(--color-danger)" }}
                aria-label="Revoke session"
              >
                <ButtonLoading loading={revokingId === s.id} spinnerSize={14}>
                  <Trash2 size={14} />
                </ButtonLoading>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
