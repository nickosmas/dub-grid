"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
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
  const terms = await fetchTermsAcceptanceStatus();
  if (!terms.acceptedCurrentTerms) {
    return `/accept-terms?next=${encodeURIComponent(POST_LOGIN_DESTINATION)}`;
  }
  return POST_LOGIN_DESTINATION;
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

/**
 * The apex `/login` — the domain selector — as seen from an org subdomain.
 *
 * Reads `window.location` directly rather than `useClientHost`, because both
 * callers need it before that hook's effect has resolved: its SSR default
 * would aim the hop at the wrong host.
 */
export function apexLoginHref(search = ""): string {
  const { protocol, host } = window.location;
  const { rootDomain, port } = parseHost(host);
  return `${protocol}//${rootDomain}${port}/login${search}`;
}

export function useSessionInvalidToast() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code === "session_invalid") {
      toast.error("We couldn't verify your session. Sign in again.");
      // Clean the URL so a refresh doesn't re-show the toast
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
    <Modal title="Account disabled" onClose={onClose} className="dg-modal--account-disabled">
      <p className="dg-auth-modal-copy">
        Your organization disabled this account. Contact your administrator if you think that's a
        mistake.
      </p>
      <Button
        type="button"
        onClick={onClose}
        className="dg-btn dg-btn-primary dg-auth-state-primary"
      >
        OK
      </Button>
    </Modal>
  );
}
