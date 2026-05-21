"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const STORAGE_KEY = "dubgrid-cookie-consent";
// IMPORTANT: Bump this version when cookies, analytics providers, or the
// cookie/privacy policy change. A new version re-prompts all users to re-consent.
// 1.1 — Sentry session replay moved behind analytics consent (error monitoring
//       stays always-on as a necessary operational service).
const CONSENT_VERSION = "1.1";

/** Fired after consent is saved so other components can react without a full page reload. */
const CONSENT_CHANGED_EVENT = "dubgrid:consent-changed";
/** Fired by footers / settings to re-open the banner in its customize view. */
const OPEN_CONSENT_EVENT = "dubgrid:open-consent";

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

function writeStoredConsent(prefs: CookiePreferences) {
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

/**
 * Persist a consent choice everywhere it needs to live: local storage, the
 * cross-subdomain cookie, the server audit trail, and a window event so live
 * consumers (Sentry, PostHog, the on-page preferences manager) react at once.
 * Shared by the banner and the cookie-policy preferences manager.
 */
export function setCookieConsent(analytics: boolean) {
  const prefs: CookiePreferences = { essential: true, analytics };
  writeStoredConsent(prefs);
  syncConsentToServer(prefs);
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

export { CONSENT_CHANGED_EVENT, OPEN_CONSENT_EVENT, CONSENT_VERSION };

/** Dispatch the event that re-opens the consent banner from anywhere (footers, settings). */
export function openConsentPreferences() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
  }
}

export function subscribeToConsentChanges(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

export function getAnalyticsConsentSnapshot(): boolean {
  return getCookieConsent()?.analytics === true;
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsentSnapshot();
}

/**
 * The saved analytics choice to edit against, or null when there's no current
 * decision (no stored consent, or a stored consent from an older version).
 */
function readBaseline(): boolean | null {
  const consent = getCookieConsent();
  if (!consent || consent.version !== CONSENT_VERSION) return null;
  return consent.analytics === true;
}

export default function CookieConsent() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [dialogOpen, setDialogOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const consent = getCookieConsent();
    return !(consent !== null && consent.version === CONSENT_VERSION);
  });
  const [view, setView] = useState<"summary" | "customize">("summary");
  // The saved analytics choice the customize view is editing against. null when
  // there's no current decision yet (first visit or a version bump re-prompt),
  // which means any save is a fresh decision and Save should be enabled.
  const [baseline, setBaseline] = useState<boolean | null>(readBaseline);
  // Draft toggle state for the customize view; seeded from the baseline.
  const [analyticsDraft, setAnalyticsDraft] = useState(() => baseline ?? false);

  // Footers and settings dispatch this to re-open the banner straight into
  // the granular customize view, even after a prior choice was saved.
  useEffect(() => {
    function onOpen() {
      const current = readBaseline();
      setBaseline(current);
      setAnalyticsDraft(current ?? false);
      setView("customize");
      setDialogOpen(true);
    }
    window.addEventListener(OPEN_CONSENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, onOpen);
  }, []);

  function close(analytics: boolean) {
    setCookieConsent(analytics);
    setDialogOpen(false);
    setView("summary");
  }

  // Closing the banner: if a current decision already exists (re-opened from a
  // "Cookie preferences" link), just dismiss without changing anything. If there
  // is no current decision yet, dismissing declines non-essential cookies — the
  // privacy-safe default, equivalent to "Essential only".
  function handleClose() {
    if (baseline === null) {
      close(false);
    } else {
      setDialogOpen(false);
      setView("summary");
    }
  }

  // Save only does something when the draft differs from the saved choice, or
  // when there's no saved choice yet (the first decision must be recordable).
  const hasChanges = baseline === null || analyticsDraft !== baseline;

  if (!mounted || !dialogOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col gap-3 border-t p-4 pr-12 sm:flex-row sm:items-center sm:justify-center sm:gap-4 sm:p-5 sm:pr-14"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.08)",
      }}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close and keep essential cookies only"
        title="Close"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md sm:right-3 sm:top-3"
        style={{ color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
      >
        <X size={18} />
      </button>
      {view === "summary" ? (
        <>
          <p
            className="m-0 max-w-[540px] leading-relaxed"
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            We use essential cookies to make DubGrid work. We&apos;d also like to set
            analytics cookies to help us improve.{" "}
            <a
              href="/cookie-policy"
              style={{ color: "var(--color-brand)", textDecoration: "underline" }}
            >
              Cookie policy
            </a>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-shrink-0">
            <button
              onClick={() => setView("customize")}
              className="dg-btn dg-btn-ghost"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Customize
            </button>
            <button
              onClick={() => close(false)}
              className="dg-btn dg-btn-secondary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Essential only
            </button>
            <button
              onClick={() => close(true)}
              className="dg-btn dg-btn-primary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Accept all
            </button>
          </div>
        </>
      ) : (
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          <p
            className="m-0 font-semibold"
            style={{ fontSize: "var(--dg-fs-body)", color: "var(--color-text-primary)" }}
          >
            Cookie preferences
          </p>

          <ConsentCategory
            title="Essential"
            description="Required for sign-in, security, and core features. Includes error monitoring so we can keep DubGrid running. These can't be turned off."
          >
            <Switch checked disabled onChange={() => {}} ariaLabel="Essential cookies (always on)" />
          </ConsentCategory>

          <ConsentCategory
            title="Analytics & performance"
            description="Helps us understand usage and improve DubGrid. Covers product analytics, web-vitals, and Sentry session replay."
          >
            <Switch
              checked={analyticsDraft}
              onChange={setAnalyticsDraft}
              ariaLabel="Analytics cookies"
            />
          </ConsentCategory>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <a
              href="/cookie-policy"
              className="dg-btn dg-btn-ghost"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Cookie policy
            </a>
            <button
              onClick={() => close(analyticsDraft)}
              disabled={!hasChanges}
              className="dg-btn dg-btn-primary"
              style={{ fontSize: "var(--dg-fs-body-sm)", padding: "8px 16px" }}
            >
              Save preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentCategory({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 rounded-[10px] border p-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-hover)" }}
    >
      <div className="min-w-0">
        <p
          className="m-0 font-semibold"
          style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-primary)" }}
        >
          {title}
        </p>
        <p
          className="m-0 mt-1 leading-relaxed"
          style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-secondary)" }}
        >
          {description}
        </p>
      </div>
      <div className="mt-0.5 flex-shrink-0">{children}</div>
    </div>
  );
}
