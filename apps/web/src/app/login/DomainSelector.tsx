"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PublicRoute } from "@/components/RouteGuards";
import { getValidPort, buildSubdomainHost, RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { SubdomainField } from "@/components/auth/SubdomainField";
import Modal from "@/components/Modal";
import { useClientHost } from "./shared";

export default function DomainSelector() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const { parsed } = useClientHost();
  const baseDomain = parsed?.rootDomain ?? "localhost";

  // Hidden gridmaster entry — 5 taps on logo within 3s
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = useCallback((e: React.MouseEvent) => {
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
  }, [parsed]);

  function showToast(msg: string) {
    toast.error(msg, { id: "login-error" });
  }

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
    let orgName: string | null = null;
    try {
      const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(normalized)}`);
      const { valid, name } = await res.json();
      if (!valid) {
        showToast("No organization found for that subdomain. Please check and try again.");
        setLoading(false);
        return;
      }
      orgName = typeof name === "string" ? name : null;
    } catch {
      showToast("Unable to verify that subdomain. Please try again.");
      setLoading(false);
      return;
    }

    const { protocol, port } = window.location;
    const portStr = getValidPort(port);
    // Forward the resolved name so the org login heading renders it instantly.
    const nameParam = orgName ? `&name=${encodeURIComponent(orgName)}` : "";
    window.location.href = `${protocol}//${normalized}.${baseDomain}${portStr}/login?verified=1${nameParam}`;
  }

  return (
    <PublicRoute>
      <PageShell>
        <Card>
          {/* Logo — links to landing page; hidden gridmaster entry on 5 rapid taps */}
          <Link
            href="/"
            onClick={handleLogoTap}
            className="dg-auth-logo-block"
            style={{
              marginBottom: "32px",
              userSelect: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <DubGridLogo size={52} />
            <DubGridWordmark />
          </Link>

          <p
            style={{
              textAlign: "center",
              fontSize: "var(--dg-fs-body)",
              color: "var(--color-text-secondary)",
              marginBottom: "28px",
              fontWeight: 500,
            }}
          >
            Enter your organization&apos;s subdomain to sign in.
          </p>

          <form onSubmit={handleContinue}>
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

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <button
                type="submit"
                disabled={loading}
                className="dg-auth-submit"
                style={{
                  padding: "12px 28px",
                  width: "auto",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                }}
              >
                <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={28}>Continue</ButtonLoading>
              </button>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="dg-auth-link"
                style={{
                  color: "var(--color-text-subtle)",
                  fontSize: "var(--dg-fs-body-sm)",
                }}
              >
                Need help finding your subdomain?
              </button>
            </div>
          </form>
        </Card>

        {showHelp && (
          <Modal
            title="How to find your subdomain"
            onClose={() => setShowHelp(false)}
            style={{ maxWidth: 360 }}
          >
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "var(--dg-fs-body-sm)",
                lineHeight: 1.5,
                color: "var(--color-text-secondary)",
              }}
            >
              Your organization subdomain is the first part of your URL (e.g.{" "}
              <strong>yourorg</strong>.{baseDomain}). If you don&apos;t know
              it, contact your organization administrator.
            </p>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="dg-btn dg-btn-primary"
              style={{ width: "100%" }}
            >
              Got it
            </button>
          </Modal>
        )}
      </PageShell>
    </PublicRoute>
  );
}
