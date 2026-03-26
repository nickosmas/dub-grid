"use client";

import { useState } from "react";
import { startImpersonation, endImpersonation } from "@/lib/db";

export default function ImpersonationPanel() {
  const [targetUserId, setTargetUserId] = useState("");
  const [justification, setJustification] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!targetUserId.trim() || justification.trim().length < 10) return;
    setLoading(true);
    setError(null);
    try {
      const result = await startImpersonation(
        targetUserId.trim(),
        justification.trim(),
        undefined,
        navigator.userAgent,
      );
      setSessionId(result.session_id);
      setExpiresAt(result.expires_at);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start impersonation",
      );
    } finally {
      setLoading(false);
    }
  }

  async function end() {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      await endImpersonation(sessionId);
      setSessionId(null);
      setExpiresAt(null);
      setTargetUserId("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to end impersonation",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
        Start a support impersonation session by target user id. Sessions are
        capped at 30 minutes.
      </p>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          placeholder="target user uuid"
          className="dg-input"
          style={{ flex: "1 1 280px" }}
        />
        <input
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="justification (min 10 chars)"
          className="dg-input"
          style={{ flex: "1 1 280px" }}
        />
        <button
          className="dg-btn dg-btn-primary"
          onClick={start}
          disabled={loading || !targetUserId.trim() || justification.trim().length < 10}
        >
          {loading ? "Starting..." : "Start session"}
        </button>
        <button
          className="dg-btn dg-btn-secondary"
          onClick={end}
          disabled={loading || !sessionId}
        >
          End session
        </button>
      </div>

      {sessionId && (
        <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
          Active session: <code>{sessionId}</code>
          {expiresAt
            ? ` · expires ${new Date(expiresAt).toLocaleString()}`
            : ""}
        </div>
      )}

      {error && <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-danger)" }}>{error}</div>}
    </div>
  );
}
