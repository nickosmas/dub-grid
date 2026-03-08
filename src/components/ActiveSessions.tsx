"use client";

import { useCallback, useEffect, useState } from "react";
import { UserSession } from "@/types";
import * as db from "@/lib/db";

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function ActiveSessions() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await db.fetchUserSessions();
      setSessions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = useCallback(async (refreshTokenHash: string) => {
    try {
      await db.revokeUserSession(refreshTokenHash);
      setSessions((prev) =>
        prev.filter((s) => s.refreshTokenHash !== refreshTokenHash),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    }
  }, []);

  if (loading) {
    return <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading sessions...</div>;
  }

  if (error) {
    return <div style={{ fontSize: 13, color: "#B91C1C" }}>{error}</div>;
  }

  if (sessions.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No active sessions found.</div>;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      {sessions.map((s) => (
        <li
          key={s.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "10px 12px",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)" }}>
              {s.deviceLabel ?? "Unknown device"}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Last active {formatRelativeTime(s.lastActiveAt)}
              {s.ipAddress ? ` · ${s.ipAddress}` : ""}
            </span>
          </div>
          <button
            onClick={() => revoke(s.refreshTokenHash)}
            style={{
              border: "1px solid var(--color-border)",
              background: "#fff",
              borderRadius: 7,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign out device
          </button>
        </li>
      ))}
    </ul>
  );
}
