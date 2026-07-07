"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { fetchTermsAcceptanceStatus } from "@/features/account/client";
import { parseHost, type ParsedHost } from "@/lib/subdomain";

export const POST_LOGIN_DESTINATION = "/dashboard";

/**
 * Resolves where to send the user after a successful sign-in: either the
 * standalone `/accept-terms` page (preserving the original destination as
 * `?next=...`), or the real destination itself.
 *
 * Used only by the MFA-verified branches — the non-MFA path gets
 * `destination` directly from POST /api/auth/login, which resolves this
 * same check server-side (see orchestratePostSignIn in that route). MFA
 * verification happens against Supabase directly from the browser, so
 * there's no equivalent single request to fold this into for that path.
 */
export async function resolvePostLoginDestination(): Promise<string> {
  try {
    const terms = await fetchTermsAcceptanceStatus();
    if (!terms.acceptedCurrentTerms) {
      return `/accept-terms?next=${encodeURIComponent(POST_LOGIN_DESTINATION)}`;
    }
  } catch {
    // Best-effort: a failure here means the user lands on the destination
    // without a ToS check this turn. They'll be re-checked next sign-in.
  }
  return POST_LOGIN_DESTINATION;
}

// Persists the last-resolved display name for a subdomain so post-logout
// redirects to /login can paint the org name immediately instead of flashing
// the raw slug while validate-domain re-resolves.
export function orgNameCacheKey(slug: string): string {
  return `dg:org-name:${slug}`;
}

/**
 * Surfaces a toast when the middleware redirected back with
 * ?error=session_invalid (JWKS-based jwtVerify failed, e.g. token expired or
 * the JWKS endpoint was unreachable). Runs on both the org and gridmaster
 * login flows.
 */
/**
 * `window.location` (host, protocol) is only known client-side, but all
 * three login components are now server-rendered (see app/login/page.tsx),
 * so computing this directly during render — e.g.
 * `typeof window !== "undefined" ? parseHost(window.location.host) : null` —
 * produces a different value on the server (window undefined → fallback)
 * than on the client's first hydration pass, which is a hydration mismatch
 * React has to discard and re-render around. Starting from a fixed,
 * SSR-matching default and only resolving the real value in an effect
 * (client-only, runs after hydration) avoids that.
 */
export function useClientHost(): { parsed: ParsedHost | null; protocol: string } {
  const [state, setState] = useState<{ parsed: ParsedHost | null; protocol: string }>({
    parsed: null,
    protocol: "https:",
  });

  useEffect(() => {
    setState({
      parsed: parseHost(window.location.host),
      protocol: window.location.protocol,
    });
  }, []);

  return state;
}

export function useSessionInvalidToast() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code === "session_invalid") {
      toast.error("Your session could not be verified. Please sign in again.");
      // Clean the URL so a refresh doesn't re-show the toast
      window.history.replaceState({}, "", window.location.pathname);
    } else if (code === "inactivity_timeout") {
      toast.info("You were signed out after 30 minutes of inactivity.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
}

// ── Account-disabled modal ─────────────────────────────────────────────────
// Shown when /api/auth/login returns 403 with code ACCOUNT_DISABLED — the JWT
// hook refuses terminated employees with a sentinel message that the route
// translates into this structured response. A modal (not a toast) so the user
// has to acknowledge it and there's no ambiguity with the generic 401 toast.

export function AccountDisabledModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Account disabled" onClose={onClose} style={{ maxWidth: 400 }}>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "var(--dg-fs-body-sm)",
          lineHeight: 1.5,
          color: "var(--color-text-secondary)",
        }}
      >
        This account has been disabled by your organization. Please contact your
        administrator if you believe this is a mistake.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="dg-btn dg-btn-primary"
        style={{ width: "100%" }}
      >
        OK
      </button>
    </Modal>
  );
}
