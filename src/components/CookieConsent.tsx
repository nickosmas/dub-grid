"use client";

import { useState, useSyncExternalStore } from "react";
import { initPostHog, resetPostHog } from "@/lib/posthog";

const STORAGE_KEY = "dubgrid-cookie-consent";
// IMPORTANT: Bump this version when cookies, analytics providers, or the
// cookie/privacy policy change. A new version re-prompts all users to re-consent.
const CONSENT_VERSION = "1.0";

/** Fired after consent is saved so other components can react without a full page reload. */
const CONSENT_CHANGED_EVENT = "dubgrid:consent-changed";

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  version?: string;
}

export function getCookieConsent(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    // Cookie is the primary store (works cross-subdomain in production).
    // localStorage is a fallback for localhost where subdomain cookies are unreliable.
    const cookieEntry = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${STORAGE_KEY}=`));
    if (cookieEntry) {
      const value = decodeURIComponent(cookieEntry.split("=")[1]);
      return JSON.parse(value) as CookiePreferences;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as CookiePreferences;

    return null;
  } catch {
    return null;
  }
}

function isSecure(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h.endsWith(".localhost");
}

/** Build a domain suffix so the cookie is readable across all subdomains. */
function getCookieDomain(): string {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  // localhost doesn't support domain= attribute — omit it
  if (isLocalhost()) return "";
  // For production (e.g. app.dubgrid.com, org.dubgrid.com) → domain=.dubgrid.com
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    const root = parts.slice(-2).join(".");
    return `; domain=.${root}`;
  }
  return "";
}

function setStoredConsent(prefs: CookiePreferences) {
  const withVersion = { ...prefs, version: CONSENT_VERSION };
  // Write to localStorage (primary — works reliably on localhost subdomains)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withVersion));
  } catch { /* storage full or blocked — cookie fallback below */ }
  // Also write to cookie for cross-subdomain support in production
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const value = encodeURIComponent(JSON.stringify(withVersion));
  document.cookie = `${STORAGE_KEY}=${value}; expires=${expires.toUTCString()}; path=/${getCookieDomain()}; SameSite=Lax${isSecure() ? "; Secure" : ""}`;
}

/** Sync consent to the server for GDPR audit trail. Best-effort, non-blocking. */
function syncConsentToServer(prefs: CookiePreferences) {
  fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consent: { essential: prefs.essential, analytics: prefs.analytics },
      version: CONSENT_VERSION,
    }),
  }).catch(() => {
    // Best-effort — do not block UI
  });
}

export { CONSENT_CHANGED_EVENT };

export function hasAnalyticsConsent(): boolean {
  return getCookieConsent()?.analytics === true;
}

export default function CookieConsent() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [hasConsent, setHasConsent] = useState(() => {
    if (typeof window === "undefined") return false;
    const consent = getCookieConsent();
    return consent !== null && consent.version === CONSENT_VERSION;
  });
  const [dialogOpen, setDialogOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const consent = getCookieConsent();
    return !(consent !== null && consent.version === CONSENT_VERSION);
  });

  function acceptAll() {
    const hadAnalytics = getCookieConsent()?.analytics === true;
    const prefs = { essential: true, analytics: true };
    setStoredConsent(prefs);
    syncConsentToServer(prefs);
    setDialogOpen(false);
    setHasConsent(true);
    if (!hadAnalytics) {
      initPostHog();
    }
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
  }

  function acceptEssential() {
    const hadAnalytics = getCookieConsent()?.analytics === true;
    const prefs = { essential: true, analytics: false };
    setStoredConsent(prefs);
    syncConsentToServer(prefs);
    setDialogOpen(false);
    setHasConsent(true);
    if (hadAnalytics) {
      resetPostHog();
    }
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
  }

  if (!mounted) return null;

  // Settings button — shown when consent has been given but dialog is closed
  if (hasConsent && !dialogOpen) {
    return (
      <button
        onClick={() => setDialogOpen(true)}
        aria-label="Cookie settings"
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 9998,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-subtle)",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          opacity: 0.6,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
        title="Cookie settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
          <path d="M8.5 8.5v.01" />
          <path d="M16 15.5v.01" />
          <path d="M12 12v.01" />
          <path d="M11 17v.01" />
          <path d="M7 14v.01" />
        </svg>
      </button>
    );
  }

  if (!dialogOpen) return null;

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
          href="/cookie-policy"
          style={{ color: "var(--color-brand)", textDecoration: "underline" }}
        >
          Cookie policy
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
