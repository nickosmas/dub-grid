"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { fetchOrganizationUsers, startImpersonation, endImpersonation } from "@/lib/db";
import { setImpersonationCookie, clearImpersonationCookie } from "@/lib/impersonation";
import { clearPermsCache } from "@/hooks/usePermissions";
import { clearOrgDataCache } from "@/hooks/useOrganizationData";
import type { Organization, OrganizationUser } from "@/types";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle } from "@/lib/styles";
import ButtonSpinner from "@/components/ButtonSpinner";

export default function EnhancedImpersonation({
  organizations,
  initialOrgId,
  initialTargetId,
}: {
  organizations: Organization[];
  initialOrgId?: string;
  initialTargetId?: string;
}) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialOrgId ?? null);
  const [orgSearch, setOrgSearch] = useState("");
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<OrganizationUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const selectedOrg = useMemo(
    () => organizations.find((o) => o.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );

  // When both org and user are pre-selected (e.g. from org detail view), skip the pickers
  const preSelected = !!(initialOrgId && initialTargetId);

  // Load users when org changes
  useEffect(() => {
    if (!selectedOrgId) {
      setUsers([]);
      setSelectedUser(null);
      return;
    }
    let cancelled = false;
    setLoadingUsers(true);
    setSelectedUser(null);
    setSearch("");
    fetchOrganizationUsers(selectedOrgId)
      .then((data) => {
        if (cancelled) return;
        const nonGridmaster = data.filter((u) => u.platformRole !== "gridmaster");
        setUsers(nonGridmaster);
        if (initialTargetId) {
          const found = nonGridmaster.find((u) => u.id === initialTargetId);
          if (found) setSelectedUser(found);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load organization users");
      })
      .finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [selectedOrgId, initialTargetId]);

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

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) =>
      o.name.toLowerCase().includes(q) || (o.slug ?? "").toLowerCase().includes(q),
    );
  }, [organizations, orgSearch]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users.slice(0, 20);
    return users.filter((u) =>
      (u.email ?? "").toLowerCase().includes(q),
    ).slice(0, 20);
  }, [users, search]);

  async function handleStart() {
    if (!selectedUser || !selectedOrg) return;
    const trimmedJustification = justification.trim();
    if (trimmedJustification.length < 10) {
      toast.error("Please provide a justification (at least 10 characters)");
      return;
    }
    setLoading(true);
    try {
      const result = await startImpersonation(
        selectedUser.id,
        trimmedJustification,
        undefined,
        navigator.userAgent,
        selectedOrg.id,
      );
      setImpersonationCookie({
        sessionId: result.session_id,
        targetUserId: selectedUser.id,
        targetOrgId: selectedOrg.id,
        targetOrgSlug: selectedOrg.slug ?? "",
        targetOrgRole: selectedUser.orgRole ?? "user",
        targetEmail: selectedUser.email ?? "",
        targetOrgName: selectedOrg.name,
        justification: trimmedJustification,
        expiresAt: result.expires_at,
      });
      clearPermsCache();
      clearOrgDataCache();
      fetch("/api/notify-impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: selectedUser.email,
          targetOrgName: selectedOrg.name,
          type: "start",
          sessionId: result.session_id,
          justification: trimmedJustification,
        }),
      }).catch(() => {});
      toast.success(`Impersonating ${selectedUser.email} in ${selectedOrg.name} — redirecting…`);
      window.location.replace("/schedule");
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to start impersonation");
      setLoading(false);
    }
  }

  async function handleEnd() {
    if (!sessionId) return;
    setLoading(true);
    try {
      await endImpersonation(sessionId, "manual");
    } catch {
      // Best-effort — clearing cookie is what matters
    }
    clearImpersonationCookie();
    clearPermsCache();
    clearOrgDataCache();
    setSessionId(null);
    setExpiresAt(null);
    setSelectedUser(null);
    setSearch("");
    setJustification("");
    toast.success("Impersonation session ended");
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
        User Impersonation
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
        {preSelected
          ? "Provide a justification to start the impersonation session. Sessions are capped at 30 minutes."
          : "Select an organization, then choose a user to impersonate. Sessions are capped at 30 minutes."}
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
            <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-info)" }}>
              Active Session
            </div>
            <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 4 }}>
              Impersonating <strong>{selectedUser?.email}</strong>
              {selectedOrg && ` in ${selectedOrg.name}`}
            </div>
            {countdown && (
              <div style={{ fontSize: "var(--dg-fs-card-title)", fontWeight: 700, color: "var(--color-info)", marginTop: 6, fontFamily: "var(--font-dm-mono), monospace" }}>
                {countdown}
              </div>
            )}
          </div>
          <button
            className="dg-btn dg-btn-danger"
            onClick={handleEnd}
            disabled={loading}
            style={{ fontSize: "var(--dg-fs-caption)", flexShrink: 0 }}
          >
            {loading ? <ButtonSpinner size={14} /> : "End Session"}
          </button>
        </div>
      )}

      {/* Organization selector (hidden when pre-selected from org detail) */}
      {!sessionId && !preSelected && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>1. Select Organization</div>
          <div style={sectionBodyStyle}>
            <input
              className="dg-input"
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder="Search organizations…"
              style={{ marginBottom: 12 }}
            />
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {filteredOrgs.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
                  No matching organizations
                </div>
              ) : (
                filteredOrgs.map((o) => {
                  const isSelected = selectedOrgId === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => setSelectedOrgId(o.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "8px 12px",
                        background: isSelected ? "var(--color-bg-secondary)" : "transparent",
                        border: isSelected ? "1px solid var(--color-border)" : "1px solid transparent",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        marginBottom: 2,
                        transition: "background 150ms ease",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {o.name}
                        </div>
                        {o.slug && (
                          <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono), monospace", marginTop: 1 }}>
                            {o.slug}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-info)", fontWeight: 600 }}>Selected</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pre-selected: show just the target summary + justification */}
      {!sessionId && preSelected && selectedOrgId && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Confirm Impersonation</div>
          <div style={sectionBodyStyle}>
            {loadingUsers || !selectedUser ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
                Loading user…
              </div>
            ) : (
              <>
                <div style={{ padding: "10px 14px", background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)", borderRadius: 8 }}>
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {selectedUser.email}
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", marginTop: 2 }}>
                    {selectedUser.orgRole?.replace("_", " ") ?? "user"} in {selectedOrg?.name}
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: "block", fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    Justification <span style={{ color: "var(--color-danger)" }}>*</span>
                  </label>
                  <textarea
                    className="dg-input"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Why are you impersonating this user? (min 10 characters)"
                    rows={3}
                    style={{ marginTop: 4, resize: "vertical", width: "100%" }}
                  />
                  {justification.trim().length > 0 && justification.trim().length < 10 && (
                    <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-danger)", marginTop: 4 }}>
                      Justification must be at least 10 characters ({justification.trim().length}/10)
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button
                    className="dg-btn dg-btn-primary"
                    onClick={handleStart}
                    disabled={loading || justification.trim().length < 10}
                  >
                    {loading ? <ButtonSpinner size={16} /> : `Impersonate ${selectedUser.email}`}
                  </button>
                  <button
                    className="dg-btn dg-btn-secondary"
                    onClick={() => { setSelectedUser(null); setJustification(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* User picker (only visible when org is selected, not pre-selected) */}
      {!sessionId && !preSelected && selectedOrgId && (
        <div style={{ ...sectionStyle, marginTop: 16 }}>
          <div style={sectionHeaderStyle}>
            2. Select User{selectedOrg ? ` in ${selectedOrg.name}` : ""}
          </div>
          <div style={sectionBodyStyle}>
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email…"
              style={{ marginBottom: 12 }}
            />

            {loadingUsers ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
                Loading users…
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {filteredUsers.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
                    No matching users in this organization
                  </div>
                ) : (
                  filteredUsers.map((u) => {
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
                          background: isSelected ? "var(--color-bg-secondary)" : "transparent",
                          border: isSelected ? "1px solid var(--color-border)" : "1px solid transparent",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                          marginBottom: 2,
                          transition: "background 150ms ease",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                            {u.email ?? "No email"}
                          </div>
                          <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", marginTop: 1 }}>
                            {u.orgRole?.replace("_", " ") ?? "user"}
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-info)", fontWeight: 600 }}>Selected</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {selectedUser && (
              <>
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: "block", fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    Justification <span style={{ color: "var(--color-danger)" }}>*</span>
                  </label>
                  <textarea
                    className="dg-input"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Why are you impersonating this user? (min 10 characters)"
                    rows={3}
                    style={{ marginTop: 4, resize: "vertical", width: "100%" }}
                  />
                  {justification.trim().length > 0 && justification.trim().length < 10 && (
                    <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-danger)", marginTop: 4 }}>
                      Justification must be at least 10 characters ({justification.trim().length}/10)
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button
                    className="dg-btn dg-btn-primary"
                    onClick={handleStart}
                    disabled={loading || justification.trim().length < 10}
                  >
                    {loading ? <ButtonSpinner size={16} /> : `Impersonate ${selectedUser.email}`}
                  </button>
                  <button
                    className="dg-btn dg-btn-secondary"
                    onClick={() => { setSelectedUser(null); setJustification(""); }}
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
