"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { fetchAllUsers, startImpersonation, endImpersonation } from "@/lib/db";
import type { PlatformUser } from "@/types";

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid var(--color-border-light)",
  fontWeight: 700,
  fontSize: 14,
  color: "var(--color-text-secondary)",
};

const sectionBodyStyle: React.CSSProperties = { padding: 20 };

export default function EnhancedImpersonation({
  initialTargetId,
}: {
  initialTargetId?: string;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  // Load all users for the picker
  useEffect(() => {
    let cancelled = false;
    fetchAllUsers()
      .then((data) => {
        if (cancelled) return;
        const nonGridmaster = data.filter((u) => u.platformRole !== "gridmaster");
        setUsers(nonGridmaster);
        // Auto-select if initial target provided
        if (initialTargetId) {
          const found = nonGridmaster.find((u) => u.id === initialTargetId);
          if (found) setSelectedUser(found);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [initialTargetId]);

  // Countdown timer for active session
  useEffect(() => {
    if (!expiresAt) { setCountdown(null); return; }
    const interval = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("Expired");
        setSessionId(null);
        setExpiresAt(null);
        clearInterval(interval);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${String(secs).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users.slice(0, 20);
    return users.filter((u) =>
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.orgName ?? "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [users, search]);

  async function handleStart() {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const result = await startImpersonation(selectedUser.id);
      setSessionId(result.session_id);
      setExpiresAt(result.expires_at);
      toast.success(`Impersonation session started for ${selectedUser.email}`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start impersonation");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd() {
    if (!sessionId) return;
    setLoading(true);
    try {
      await endImpersonation(sessionId);
      setSessionId(null);
      setExpiresAt(null);
      setSelectedUser(null);
      setSearch("");
      toast.success("Impersonation session ended");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to end impersonation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
        User Impersonation
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--color-text-muted)" }}>
        Start a support impersonation session. Sessions are capped at 30 minutes.
      </p>

      {/* Active session */}
      {sessionId && (
        <div
          style={{
            background: "var(--color-info-bg)",
            border: "1px solid var(--color-info)",
            borderRadius: 10,
            padding: "14px 20px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-info)" }}>
              Active Session
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
              Impersonating <strong>{selectedUser?.email}</strong>
              {selectedUser?.orgName && ` (${selectedUser.orgName})`}
            </div>
            {countdown && (
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-info)", marginTop: 6, fontFamily: "var(--font-dm-mono), monospace" }}>
                {countdown}
              </div>
            )}
          </div>
          <button
            className="dg-btn dg-btn-danger"
            onClick={handleEnd}
            disabled={loading}
            style={{ fontSize: 12, flexShrink: 0 }}
          >
            {loading ? "Ending…" : "End Session"}
          </button>
        </div>
      )}

      {/* User picker */}
      {!sessionId && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Select User</div>
          <div style={sectionBodyStyle}>
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or organization…"
              style={{ marginBottom: 12 }}
            />

            {loadingUsers ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                Loading users…
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                    No matching users
                  </div>
                ) : (
                  filtered.map((u) => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          padding: "8px 12px",
                          background: isSelected ? "var(--color-surface-overlay)" : "transparent",
                          border: isSelected ? "1px solid var(--color-border)" : "1px solid transparent",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                          marginBottom: 2,
                          transition: "background 100ms ease",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                            {u.email ?? "No email"}
                          </div>
                          {u.orgName && (
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                              {u.orgName} · {u.orgRole?.replace("_", " ") ?? "user"}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span style={{ fontSize: 12, color: "var(--color-info)", fontWeight: 600 }}>Selected</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {selectedUser && (
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button
                  className="dg-btn dg-btn-primary"
                  onClick={handleStart}
                  disabled={loading}
                >
                  {loading ? "Starting…" : `Impersonate ${selectedUser.email}`}
                </button>
                <button
                  className="dg-btn dg-btn-secondary"
                  onClick={() => setSelectedUser(null)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
