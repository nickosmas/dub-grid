"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/Button";
import {
  getCookieConsent,
  setCookieConsent,
  subscribeToConsentChanges,
} from "@/components/CookieConsent";

type ConsentState = "all" | "essential" | "none";

function readConsent(): ConsentState {
  const c = getCookieConsent();
  if (!c) return "none";
  return c.analytics ? "all" : "essential";
}

export default function CookiePreferencesManager() {
  const consent = useSyncExternalStore(subscribeToConsentChanges, readConsent, () => "none");
  const [saving, setSaving] = useState(false);

  function updateConsent(analytics: boolean) {
    setSaving(true);
    // Shared helper writes localStorage + cross-subdomain cookie, syncs to the
    // server audit trail, and dispatches the consent-changed event.
    setCookieConsent(analytics);
    setSaving(false);
  }

  const analyticsEnabled = consent === "all";

  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 10,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-hover)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-body)",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Your current preference
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          {consent !== "none"
            ? analyticsEnabled
              ? "All cookies accepted (essential + analytics)"
              : "Essential cookies only"
            : "No preference set — the consent banner will appear on your next visit"}
        </p>
      </div>
      {consent !== "none" && (
        <div style={{ display: "flex", gap: 10 }}>
          {analyticsEnabled ? (
            <Button
              onClick={() => updateConsent(false)}
              disabled={saving}
              className="dg-btn dg-btn-secondary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Switch to essential only
            </Button>
          ) : (
            <Button
              onClick={() => updateConsent(true)}
              disabled={saving}
              className="dg-btn dg-btn-primary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Accept analytics cookies
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
