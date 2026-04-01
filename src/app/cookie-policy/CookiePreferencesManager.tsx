"use client";

import { useState, useEffect } from "react";
import { getCookieConsent, CONSENT_CHANGED_EVENT } from "@/components/CookieConsent";

type ConsentState = "all" | "essential" | "none";

function readConsent(): ConsentState {
  const c = getCookieConsent();
  if (!c) return "none";
  return c.analytics ? "all" : "essential";
}

export default function CookiePreferencesManager() {
  const [consent, setConsent] = useState<ConsentState>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    function onChange() { setConsent(readConsent()); }
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  async function updateConsent(analytics: boolean) {
    setSaving(true);
    // Dynamic import to avoid pulling CookieConsent internals into the server bundle
    const mod = await import("@/components/CookieConsent");
    // getCookieConsent is already exported; we need the internal helpers.
    // Since setStoredConsent and syncConsentToServer are not exported,
    // we dispatch the same cookie write + event that the banner does.
    const prefs = { essential: true, analytics };
    const STORAGE_KEY = "dubgrid-cookie-consent";
    const CONSENT_VERSION = "1.0";
    const withVersion = { ...prefs, version: CONSENT_VERSION };

    // Write to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(withVersion));
    } catch { /* blocked */ }

    // Write to cookie (cross-subdomain)
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    const value = encodeURIComponent(JSON.stringify(withVersion));
    const isSecure = window.location.protocol === "https:";
    const hostname = window.location.hostname;
    const isLocal = hostname === "localhost" || hostname.endsWith(".localhost");
    const parts = hostname.split(".");
    const domainAttr = !isLocal && parts.length >= 2
      ? `; domain=.${parts.slice(-2).join(".")}`
      : "";
    document.cookie = `${STORAGE_KEY}=${value}; expires=${expires.toUTCString()}; path=/${domainAttr}; SameSite=Lax${isSecure ? "; Secure" : ""}`;

    // Sync to server
    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: prefs, version: CONSENT_VERSION }),
    }).catch(() => {});

    // Handle PostHog
    if (analytics) {
      const { initPostHog } = await import("@/lib/posthog");
      initPostHog();
    } else {
      const { resetPostHog } = await import("@/lib/posthog");
      resetPostHog();
    }

    window.dispatchEvent(new Event(mod.CONSENT_CHANGED_EVENT));
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
        <p style={{ margin: 0, fontSize: "var(--dg-fs-body)", fontWeight: 600, color: "var(--color-text-primary)" }}>
          Your current preference
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>
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
            <button
              onClick={() => updateConsent(false)}
              disabled={saving}
              className="dg-btn dg-btn-secondary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Switch to essential only
            </button>
          ) : (
            <button
              onClick={() => updateConsent(true)}
              disabled={saving}
              className="dg-btn dg-btn-primary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Accept analytics cookies
            </button>
          )}
        </div>
      )}
    </div>
  );
}
