"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";
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
    <div className="dg-terms-acceptance">
      <div className="dg-terms-acceptance__header">
        <DubGridLogo size={40} />
        <h1 id="terms-acceptance-title" className="dg-terms-acceptance__title">
          Updated Terms of Service
        </h1>
        <p className="dg-terms-acceptance__intro">
          Read the updated Terms of Service in full before continuing.
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={checkAtBottom}
        aria-label="Terms of Service content"
        tabIndex={0}
        className="dg-terms-acceptance__content"
      >
        <TermsContent />
      </div>

      <div className="dg-terms-acceptance__actions">
        <p className="dg-terms-acceptance__scroll-hint" aria-live="polite">
          {reachedBottom ? "" : "Scroll to the bottom of the Terms to continue."}
        </p>

        <Button
          onClick={onAccept}
          disabled={!reachedBottom || loading}
          className="dg-btn dg-btn-primary dg-terms-acceptance__button"
          type="button"
        >
          <ButtonLoading
            loading={loading}
            spinnerColor="var(--dg-color-text-inverse)"
            spinnerSize={18}
          >
            Accept &amp; Continue
          </ButtonLoading>
        </Button>

        <p className="dg-terms-acceptance__meta">
          Terms last updated {TERMS_LAST_UPDATED}. You may also review the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="dg-auth-policy-link"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="dg-auth-policy-link"
          >
            Privacy Policy
          </a>{" "}
          in a new tab.
        </p>
      </div>
    </div>
  );
}
