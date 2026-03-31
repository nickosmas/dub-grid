"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Monitor, Smartphone, Trash2 } from "lucide-react";

interface UserSession {
  id: string;
  deviceInfo: string;
  ipAddress: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
}

function parseDeviceInfo(info: string): { icon: "mobile" | "desktop"; label: string } {
  const lower = info.toLowerCase();
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
    return { icon: "mobile", label: info };
  }
  return { icon: "desktop", label: info };
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
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("user_sessions")
        .select("id, device_info, ip_address, last_active_at, session_token")
        .eq("user_id", session.user.id)
        .order("last_active_at", { ascending: false });

      if (error) throw error;

      // Determine which is the current session (best effort via access token match)
      const currentToken = session.access_token?.slice(-20);

      setSessions(
        (data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          deviceInfo: (row.device_info as string) ?? "Unknown device",
          ipAddress: row.ip_address as string | null,
          lastActiveAt: row.last_active_at as string,
          isCurrent: currentToken
            ? ((row.session_token as string) ?? "").endsWith(currentToken)
            : false,
        })),
      );
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function handleRevoke(sessionId: string) {
    setRevokingId(sessionId);
    try {
      const { error } = await supabase
        .from("user_sessions")
        .delete()
        .eq("id", sessionId);
      if (error) throw error;
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
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
      <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
        No active sessions
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sessions.map((s) => {
        const device = parseDeviceInfo(s.deviceInfo);
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
                {s.ipAddress ?? "Unknown IP"} &middot; {formatRelative(s.lastActiveAt)}
              </div>
            </div>
            {!s.isCurrent && (
              <button
                onClick={() => handleRevoke(s.id)}
                disabled={revokingId === s.id}
                className="dg-btn dg-btn-ghost"
                style={{ padding: "4px 8px", color: "var(--color-danger)" }}
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
