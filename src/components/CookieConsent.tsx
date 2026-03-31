"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "dubgrid-cookie-consent";

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
}

function getStoredConsent(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CookiePreferences;
  } catch {
    return null;
  }
}

function setStoredConsent(prefs: CookiePreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getCookieConsent(): CookiePreferences | null {
  return getStoredConsent();
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent()?.analytics === true;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getStoredConsent()) setVisible(true);
  }, []);

  function acceptAll() {
    setStoredConsent({ essential: true, analytics: true });
    setVisible(false);
  }

  function acceptEssential() {
    setStoredConsent({ essential: true, analytics: false });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "16px 24px",
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <p style={{
        margin: 0,
        fontSize: "var(--dg-fs-body-sm)",
        color: "var(--color-text-secondary)",
        maxWidth: 540,
        lineHeight: 1.5,
      }}>
        We use essential cookies to make DubGrid work. We&apos;d also like to set analytics cookies to help us improve.{" "}
        <a
          href="/privacy"
          style={{ color: "var(--color-brand)", textDecoration: "underline" }}
        >
          Learn more
        </a>
      </p>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          onClick={acceptEssential}
          className="dg-btn dg-btn-secondary"
          style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
        >
          Essential only
        </button>
        <button
          onClick={acceptAll}
          className="dg-btn dg-btn-primary"
          style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
