"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  createCalendarSubscription,
  fetchCalendarSubscriptionStatus,
  revokeCalendarSubscription,
  rotateCalendarSubscription,
} from "@/features/account/client/api";
import type { CalendarSubscriptionStatus } from "@/features/account/shared/calendar-subscription";

export function CalendarSubscriptionCard() {
  const [status, setStatus] = useState<CalendarSubscriptionStatus | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"replace" | "disable" | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setStatus(await fetchCalendarSubscriptionStatus());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "We couldn't load this subscription.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function createLink() {
    setIsWorking(true);
    try {
      const issued = await createCalendarSubscription();
      setStatus(issued);
      setFeedUrl(issued.feedUrl);
      toast.success("Private calendar link created");
    } catch (createError) {
      toast.error(
        createError instanceof Error ? createError.message : "We couldn't create the link.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function replaceLink() {
    setIsWorking(true);
    try {
      const issued = await rotateCalendarSubscription();
      setStatus(issued);
      setFeedUrl(issued.feedUrl);
      toast.success("Private calendar link replaced");
    } catch (rotateError) {
      toast.error(
        rotateError instanceof Error ? rotateError.message : "We couldn't replace the link.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function disableSubscription() {
    setIsWorking(true);
    try {
      const nextStatus = await revokeCalendarSubscription();
      setStatus(nextStatus);
      setFeedUrl(null);
      toast.success("Calendar subscription disabled");
    } catch (revokeError) {
      toast.error(revokeError instanceof Error ? revokeError.message : "We couldn't disable it.");
    } finally {
      setIsWorking(false);
    }
  }

  async function confirmPendingAction() {
    if (pendingAction === "replace") await replaceLink();
    if (pendingAction === "disable") await disableSubscription();
    setPendingAction(null);
  }

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Calendar subscription</div>
          <div className="dg-card-subtitle">
            Subscribe to your shift schedule in your preferred calendar app.
          </div>
        </div>
      </div>
      <div className="dg-card-body flex flex-col gap-3">
        {isLoading ? (
          <p className="m-0 text-[14px] text-[var(--dg-color-text-muted)]">
            Loading subscription status...
          </p>
        ) : error ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[14px] text-[var(--dg-color-danger)]">{error}</p>
            <Button type="button" onClick={() => loadStatus()} className="dg-btn dg-btn-secondary">
              Retry
            </Button>
          </div>
        ) : !status?.active ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[14px] text-[var(--dg-color-text-muted)]">
              Create a private link that Google Calendar, Apple Calendar, or Outlook can poll
              without requiring a DubGrid login.
            </p>
            <Button
              type="button"
              onClick={() => createLink()}
              disabled={isWorking}
              className="dg-btn dg-btn-primary"
            >
              Create private link
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {feedUrl ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border)] bg-[var(--dg-color-bg)] px-3 py-2">
                  <Calendar className="size-4 shrink-0 text-[var(--dg-color-text-muted)]" />
                  <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[var(--dg-color-text-secondary)]">
                    {feedUrl}
                  </code>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(feedUrl).then(
                      () => toast.success("Calendar URL copied to clipboard"),
                      () => toast.error("We couldn't copy that link. Copy it manually instead."),
                    )
                  }
                  className="dg-btn dg-btn-secondary"
                >
                  <Copy className="mr-1 size-4" />
                  Copy link
                </Button>
              </div>
            ) : (
              <p className="m-0 text-[14px] text-[var(--dg-color-text-muted)]">
                Your subscription is enabled. For security, its private link is shown only when
                created or replaced.
              </p>
            )}
            <p className="m-0 text-[12px] text-[var(--dg-color-text-subtle)]">
              Replacing the link immediately disables the previous URL.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => setPendingAction("replace")}
                disabled={isWorking}
                className="dg-btn dg-btn-secondary"
              >
                Replace link
              </Button>
              <Button
                type="button"
                onClick={() => setPendingAction("disable")}
                disabled={isWorking}
                className="dg-btn dg-btn-danger"
              >
                Disable subscription
              </Button>
            </div>
          </div>
        )}
      </div>
      {pendingAction === "replace" && (
        <ConfirmDialog
          title="Replace private link?"
          message="The previous URL stops working immediately and must be updated in every calendar app that uses it."
          confirmLabel="Replace link"
          variant="warning"
          onConfirm={confirmPendingAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {pendingAction === "disable" && (
        <ConfirmDialog
          title="Disable calendar subscription?"
          message="Calendar apps will stop receiving updates until you create a new link."
          confirmLabel="Disable subscription"
          variant="danger"
          onConfirm={confirmPendingAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
