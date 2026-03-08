"use client";

import { useState } from "react";
import * as db from "@/lib/db";

export default function ImpersonationPanel() {
  const [targetUserId, setTargetUserId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!targetUserId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await db.startImpersonation(targetUserId.trim());
      setSessionId(result.session_id);
      setExpiresAt(result.expires_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start impersonation");
    } finally {
      setLoading(false);
    }
  }

  async function end() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      await db.endImpersonation(sessionId);
      setSessionId(null);
      setExpiresAt(null);
      setTargetUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end impersonation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
        Start a support impersonation session by target user id. Sessions are capped at 30 minutes.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          placeholder="target user uuid"
          style={{
            flex: "1 1 280px",
            padding: "8px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <button
          onClick={start}
          disabled={loading || !targetUserId.trim()}
          style={{
            background: targetUserId.trim() && !loading ? "var(--color-accent-gradient)" : "#ccc",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: targetUserId.trim() && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Starting..." : "Start session"}
        </button>
        <button
          onClick={end}
          disabled={loading || !sessionId}
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: sessionId && !loading ? "pointer" : "not-allowed",
          }}
        >
          End session
        </button>
      </div>

      {sessionId && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Active session: <code>{sessionId}</code>
          {expiresAt ? ` · expires ${new Date(expiresAt).toLocaleString()}` : ""}
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: "#B91C1C" }}>{error}</div>}
    </div>
  );
}
