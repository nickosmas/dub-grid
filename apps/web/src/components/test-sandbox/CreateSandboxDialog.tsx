"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { BrandLoadingScreen } from "@/components/BrandLoadingScreen";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { Banner } from "@/components/ui/Banner";
import { setUserViewActive } from "@/hooks";
import { SANDBOX_OPEN_ELSEWHERE_CODE } from "@/lib/sandbox-cookie";

interface CreateSandboxDialogProps {
  orgName?: string;
  onClose: () => void;
}

/** "2:14 PM" today, "Nov 11, 2:14 PM" otherwise; null when the time is unknown. */
function formatStartedAt(startedAt: unknown): string | null {
  if (typeof startedAt !== "string") return null;
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(
    undefined,
    sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  );
}

export default function CreateSandboxDialog({ orgName, onClose }: CreateSandboxDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server found a sandbox open in another session. Nothing has
  // been deleted yet; the person decides whether to replace it.
  const [openElsewhere, setOpenElsewhere] = useState<{ startedAt: string | null } | null>(null);

  async function enter(replaceExisting: boolean) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          replaceExisting ? { action: "enter", replaceExisting } : { action: "enter" },
        ),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (response.status === 409 && body?.code === SANDBOX_OPEN_ELSEWHERE_CODE) {
        setOpenElsewhere({ startedAt: formatStartedAt(body.startedAt) });
        setIsLoading(false);
        return;
      }
      if (!response.ok) {
        setError(
          formatClientErrorMessage(body?.error, "We couldn't enter sandbox mode right now."),
        );
        setIsLoading(false);
        return;
      }
      // User view is a per-tab flag that survives the reload below. Start the
      // sandbox as yourself, not as a preview someone switched on earlier.
      setUserViewActive(false);
      // The sandbox cookie was set by the server response. Hard-reload the
      // same page (URL unchanged, so it doesn't feel like a logout) to
      // guarantee every view resets to the sandbox org: the reloaded page's
      // first bootstrap fetch sees the cookie and returns the sandbox org, so
      // the grid and any form-local state can't keep showing real-org data.
      // This mirrors the exit/reset flow in SandboxBanner — a soft
      // queryClient.clear() + invalidate left stale values in components whose
      // state lives outside React Query (and still showed real-org schedule
      // data until the AppShell remounted).
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setIsLoading(false);
    }
  }

  const errorBanner = error ? (
    <Banner tone="danger" role="alert" className="mt-2">
      {error}
    </Banner>
  ) : null;

  // Cloning the organization takes a while and ends in a reload, so the
  // dialog gives way to a full-screen Climb until then; an error brings it back.
  if (isLoading) {
    return <BrandLoadingScreen animation="climb" revealAfterMs={0} label="Entering sandbox" />;
  }

  if (openElsewhere) {
    return (
      <ConfirmDialog
        title="Replace your other sandbox?"
        message={
          <div>
            <p style={{ margin: "0 0 12px 0" }}>
              You already have a sandbox open in another window or device
              {openElsewhere.startedAt ? `, started ${openElsewhere.startedAt}` : ""}. You can only
              have one at a time.
            </p>
            <p style={{ margin: "0 0 12px 0" }}>
              Starting one here closes that one and discards its changes. Your real organization
              isn&rsquo;t affected either way.
            </p>
            {errorBanner}
          </div>
        }
        confirmLabel="Start here instead"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isLoading}
        onConfirm={() => enter(true)}
        onCancel={onClose}
      />
    );
  }

  const sourceLabel = orgName ? ` ${orgName}` : " your organization";
  const message = (
    <div>
      <p style={{ margin: "0 0 12px 0" }}>
        You get a private copy of{sourceLabel} to try things in. Nothing you do there touches your
        real schedule or people.
      </p>
      <p style={{ margin: "0 0 12px 0" }}>
        Exit from the banner at the top of the screen whenever you like, and the copy is discarded.
      </p>
      {errorBanner}
    </div>
  );

  return (
    <ConfirmDialog
      title="Enter sandbox mode"
      message={message}
      confirmLabel="Enter sandbox"
      cancelLabel="Cancel"
      variant="info"
      isLoading={isLoading}
      onConfirm={() => enter(false)}
      onCancel={onClose}
    />
  );
}
