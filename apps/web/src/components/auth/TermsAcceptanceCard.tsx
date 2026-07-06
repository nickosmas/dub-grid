"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { DubGridLogo } from "@/components/Logo";
import TermsContent, { TERMS_LAST_UPDATED } from "@/app/terms/TermsContent";

/**
 * Full Terms of Service acceptance card with scroll-to-bottom gating: the user
 * must scroll the content all the way to the bottom before the "Accept &
 * Continue" button enables. Used on the standalone `/accept-terms` page.
 */
export default function TermsAcceptanceCard({
  onAccept,
  loading = false,
}: {
  onAccept: () => void;
  loading?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [reachedBottom, setReachedBottom] = useState(false);

  // 24px tolerance: people often stop just short of the absolute end, and
  // browsers can round scrollHeight/clientHeight off by a sub-pixel. We don't
  // want the user "almost there" to be locked out by a 1px discrepancy.
  const BOTTOM_TOLERANCE_PX = 24;

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= BOTTOM_TOLERANCE_PX) {
      setReachedBottom(true);
    }
  }, []);

  // On mount: if the content already fits without scrolling (rare, but
  // possible on very tall viewports), unlock the button immediately.
  useEffect(() => {
    checkAtBottom();
  }, [checkAtBottom]);

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--dg-radius-xl)",
        boxShadow: "var(--dg-shadow-auth-card)",
        width: "100%",
        maxWidth: 960,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "32px 32px 16px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <DubGridLogo size={40} />
        <h1
          id="terms-acceptance-title"
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-heading)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Updated Terms of Service
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            maxWidth: 520,
          }}
        >
          Please read these updated Terms of Service in full before
          continuing.
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={checkAtBottom}
        aria-label="Terms of Service content"
        tabIndex={0}
        style={{
          margin: "0 32px",
          padding: "16px 24px",
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--dg-radius-lg)",
          maxHeight: "min(65vh, 640px)",
          overflowY: "auto",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        <TermsContent />
      </div>

      <div
        style={{
          padding: "20px 32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-faint)",
            textAlign: "center",
            minHeight: "1.2em",
            transition: "color 150ms ease",
          }}
          aria-live="polite"
        >
          {reachedBottom ? "" : "Scroll to the bottom of the Terms to continue."}
        </p>

        <button
          onClick={onAccept}
          disabled={!reachedBottom || loading}
          className="dg-btn dg-btn-primary"
          style={{ width: "100%", padding: "12px 16px" }}
          type="button"
        >
          <ButtonLoading
            loading={loading}
            spinnerColor="var(--color-text-inverse)"
            spinnerSize={18}
          >
            Accept &amp; Continue
          </ButtonLoading>
        </button>

        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-caption)",
            color: "var(--color-text-faint)",
            textAlign: "center",
          }}
        >
          Terms last updated {TERMS_LAST_UPDATED}. You may also review the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-brand)", textDecoration: "underline" }}
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-brand)", textDecoration: "underline" }}
          >
            Privacy Policy
          </a>{" "}
          in a new tab.
        </p>
      </div>
    </div>
  );
}
