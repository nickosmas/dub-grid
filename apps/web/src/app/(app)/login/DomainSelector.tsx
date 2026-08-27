"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { PublicRoute } from "@/components/RouteGuards";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import { getValidPort, buildSubdomainHost, RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { SubdomainField } from "@/components/auth/SubdomainField";
import Modal from "@/components/Modal";
import { withThemeParam } from "@/lib/theme-preference";
import { fetchWithTimeout, isRequestTimeout } from "@/lib/fetch-with-timeout";
import { ORG_NOT_FOUND_MESSAGE, ORG_NOT_FOUND_PARAM } from "./constants";
import { useClientHost } from "./shared";

// Shorter than the default: this is a pre-flight check standing between the
// user and the sign-in form, so it should give up early and let them retry.
const VALIDATE_DOMAIN_TIMEOUT_MS = 8_000;

export default function DomainSelector() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const { theme } = useTheme();
  const { parsed } = useClientHost();
  const baseDomain = parsed?.rootDomain ?? "localhost";

  // Hidden gridmaster entry — 5 taps on logo within 3s
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = useCallback(
    (e: React.MouseEvent) => {
      tapCountRef.current += 1;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (tapCountRef.current >= 5) {
        e.preventDefault();
        tapCountRef.current = 0;
        const gridmasterHost = buildSubdomainHost("gridmaster", parsed!);
        window.location.href = `${window.location.protocol}//${gridmasterHost}/login`;
        return;
      }
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 3000);
    },
    [parsed],
  );

  function showToast(msg: string) {
    toast.error(msg, { id: "login-error" });
  }

  // Arrived here because a subdomain's /login found no organization and sent
  // the user back (see app/login/page.tsx). Say why, then strip the param so a
  // refresh doesn't re-accuse a subdomain they may have since corrected.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(ORG_NOT_FOUND_PARAM) !== "1") return;
    toast.error(ORG_NOT_FOUND_MESSAGE, { id: "login-error" });
    params.delete(ORG_NOT_FOUND_PARAM);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  async function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      setError("Please enter your subdomain.");
      return;
    }
    // Reject anything that isn't a valid subdomain rather than silently
    // stripping it — a space or symbol means the user typed the wrong thing.
    if (!/^[a-z0-9-]+$/.test(normalized)) {
      setError("Use letters, numbers, and hyphens only.");
      return;
    }
    // Reserved words (www, api, gridmaster, ...) are never real org slugs —
    // block them here (no network call needed) so this form can't redirect
    // into the gridmaster portal or bounce into an apex-alias loop (parseHost
    // treats these as apex, not a subdomain).
    if (RESERVED_SUBDOMAINS.has(normalized)) {
      setError("That subdomain isn't available. Check your organization's URL.");
      return;
    }

    setLoading(true);
    setError("");

    // Confirm the org actually exists before navigating — landing on a
    // broken "organization not found" page after a full page reload is a
    // worse experience than a one-tick delay here, and /api/validate-domain
    // is Redis-cached (see lib/cache.ts), so repeat lookups are cheap.
    try {
      // Deadline, not optional: a stalled connection leaves a bare `fetch`
      // pending indefinitely, and this button's only path out of its loading
      // state runs after the await. Without one, a bad signal means "Checking"
      // forever with no way back.
      const res = await fetchWithTimeout(
        `/api/validate-domain?slug=${encodeURIComponent(normalized)}`,
        {},
        VALIDATE_DOMAIN_TIMEOUT_MS,
      );
      const { valid } = await res.json();
      if (!valid) {
        showToast(ORG_NOT_FOUND_MESSAGE);
        setLoading(false);
        return;
      }
    } catch (err) {
      showToast(
        isRequestTimeout(err)
          ? "That took too long. Check your connection and try again."
          : "Unable to verify that subdomain. Please try again.",
      );
      setLoading(false);
      return;
    }

    const { protocol, port } = window.location;
    const portStr = getValidPort(port);
    // The org name is deliberately NOT forwarded: the subdomain's /login
    // resolves it server-side off the same cached lookup, so the heading is
    // already correct in its first byte. Passing it through the URL would put
    // an unvalidated, caller-controlled string into that heading for nothing.
    //
    // The subdomain is a separate origin with its own localStorage, so hand the
    // theme over explicitly — otherwise the sign-in page resolves whatever that
    // origin happens to remember and the theme visibly flips mid-flow.
    window.location.href = withThemeParam(
      `${protocol}//${normalized}.${baseDomain}${portStr}/login?verified=1`,
      theme,
    );
  }

  return (
    <PublicRoute>
      <PageShell>
        <Card>
          {/* Logo — links to landing page; hidden gridmaster entry on 5 rapid taps */}
          <Link
            href="/"
            onClick={handleLogoTap}
            className="dg-auth-logo-block dg-auth-logo-block--spacious"
          >
            <DubGridLogo size={52} />
            <DubGridWordmark />
          </Link>

          <p className="dg-auth-selector-description">
            Enter your organization&apos;s subdomain to sign in.
          </p>

          <Form onSubmit={handleContinue}>
            <SubdomainField
              value={slug}
              onChange={(v) => {
                setSlug(v);
                setError("");
              }}
              baseDomain={baseDomain}
              error={error || null}
              autoFocus
              disabled={loading}
            />

            <div className="dg-auth-selector-actions">
              <button type="submit" disabled={loading} className="dg-btn dg-btn-primary dg-btn-lg">
                <ButtonLoading
                  loading={loading}
                  spinnerColor="var(--color-text-inverse)"
                  spinnerSize={20}
                >
                  Continue
                </ButtonLoading>
              </button>
              <Button
                type="button"
                onClick={() => setShowHelp(true)}
                className="dg-auth-link dg-auth-link--subtle dg-auth-help-link"
              >
                Need help finding your subdomain?
              </Button>
            </div>
          </Form>
        </Card>

        {showHelp && (
          <Modal
            title="How to find your subdomain"
            onClose={() => setShowHelp(false)}
            className="dg-modal--auth-help"
          >
            <p className="dg-auth-modal-copy">
              Your organization subdomain is the first part of your URL (e.g.{" "}
              <strong>yourorg</strong>.{baseDomain}). If you don&apos;t know it, contact your
              organization administrator.
            </p>
            <Button
              type="button"
              onClick={() => setShowHelp(false)}
              className="dg-btn dg-btn-primary dg-auth-state-primary"
            >
              Got it
            </Button>
          </Modal>
        )}
      </PageShell>
    </PublicRoute>
  );
}
