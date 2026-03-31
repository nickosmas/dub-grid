"use client";

import { useState } from "react";

const COOKIE_NAME = "dubgrid-cookie-consent";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getRootDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const hostname = window.location.hostname;
  // No domain attribute needed for localhost / IP addresses
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    // "org.dubgrid.com" -> ".dubgrid.com"
    return "." + parts.slice(-2).join(".");
  }
  return undefined;
}

function setCookie(name: string, value: string, maxAge: number) {
  const domain = getRootDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${domainPart}`;
}

export function getCookieConsent(): CookiePreferences | null {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CookiePreferences;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getCookieConsent()?.analytics === true;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    // SSR-safe: default hidden, checked on mount via key below
    if (typeof document === "undefined") return false;
    return !getCookie(COOKIE_NAME);
  });

  function acceptAll() {
    const prefs: CookiePreferences = { essential: true, analytics: true };
    setCookie(COOKIE_NAME, JSON.stringify(prefs), COOKIE_MAX_AGE);
    setVisible(false);
  }

  function acceptEssential() {
    const prefs: CookiePreferences = { essential: true, analytics: false };
    setCookie(COOKIE_NAME, JSON.stringify(prefs), COOKIE_MAX_AGE);
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
