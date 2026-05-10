"use client";

import { useState } from "react";
import {
  endGridmasterImpersonation,
  startGridmasterImpersonation,
} from "@/features/gridmaster/client";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatClientErrorMessage, formatDateTimeLabel } from "@/lib/client-facing";

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
      const result = await startGridmasterImpersonation({
        targetUserId: targetUserId.trim(),
        justification: justification.trim(),
        userAgent: navigator.userAgent,
      });
      setSessionId(result.sessionId);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      setError(
        formatClientErrorMessage(err, "We couldn't start that support session."),
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
      await endGridmasterImpersonation({ sessionId });
      setSessionId(null);
      setExpiresAt(null);
      setTargetUserId("");
    } catch (err) {
      setError(
        formatClientErrorMessage(err, "We couldn't end that support session."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
        Start a support session for a selected user. Sessions are
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
          placeholder="User ID"
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
          <ButtonLoading loading={loading} spinnerSize={16}>Start session</ButtonLoading>
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
          Active support session
          {expiresAt
            ? ` until ${formatDateTimeLabel(expiresAt)}`
            : ""}
        </div>
      )}

      {error && <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-danger)" }}>{error}</div>}
    </div>
  );
}
