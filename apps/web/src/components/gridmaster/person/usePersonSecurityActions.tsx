"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requireCredentialAssurance } from "@/features/account/client";
import {
  runGridmasterPersonSecurityAction,
  type GridmasterPersonSecurityAction,
} from "@/features/gridmaster/client";
import type {
  GridmasterCalendarFeed,
  GridmasterKnownDevice,
  GridmasterPushDevice,
  GridmasterSession,
} from "@/features/gridmaster/person-record";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface Pending {
  input: GridmasterPersonSecurityAction;
  title: string;
  message: string;
  confirmLabel: string;
  success: string;
}

/** The buttons and the one confirmation behind each Security and Sessions action. */
export function usePersonSecurityActions(userId: string | null, onChanged: () => void) {
  const stepUp = useStepUpAction();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!pending || !userId) return;
    setBusy(true);
    try {
      let lockStillHeld = false;
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        const result = await runGridmasterPersonSecurityAction(userId, pending.input, accessToken);
        lockStillHeld = Boolean(result.loginLock?.locked);
      });
      if (!completed) return;
      toast.success(
        lockStillHeld
          ? "Sign-in lock cleared, but it still reads as locked. Try again in a minute."
          : pending.success,
      );
      setPending(null);
      onChanged();
    } catch (error) {
      toast.error(formatClientErrorMessage(error, "We couldn't do that. Try again."));
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function button(label: string, next: Pending): ReactNode {
    return (
      <Button className="dg-btn dg-btn-secondary" disabled={busy} onClick={() => setPending(next)}>
        {label}
      </Button>
    );
  }

  const securityConfirm = pending;
  const dialog = (
    <>
      {securityConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title={securityConfirm.title}
          message={securityConfirm.message}
          confirmLabel={securityConfirm.confirmLabel}
          variant="warning"
          isLoading={busy}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {stepUp.dialog}
    </>
  );

  if (!userId) {
    return { dialog: null } as const;
  }

  return {
    dialog,
    renderSessionActions: (session: GridmasterSession) =>
      button("End session", {
        input: { action: "endSession", sessionId: session.id },
        title: "End session",
        message:
          "Sign this session out for good? The device has to sign in again; their other sessions stay.",
        confirmLabel: "End session",
        success: "Session ended",
      }),
    renderDeviceActions: (device: GridmasterKnownDevice) =>
      button("Forget", {
        input: { action: "forgetDevice", deviceId: device.id },
        title: "Forget device",
        message:
          "Forget this device? Their next sign-in from it sends a new-device alert. Any session on it stays signed in.",
        confirmLabel: "Forget device",
        success: "Device forgotten",
      }),
    renderPushActions: (device: GridmasterPushDevice) =>
      button("Turn off", {
        input: { action: "disablePushDevice", deviceId: device.id },
        title: "Turn off push notifications",
        message:
          "Stop push notifications to this device? If the app is still signed in, it turns them back on the next time it opens, so end its session for a lost phone.",
        confirmLabel: "Turn off",
        success: "Push notifications turned off for that device",
      }),
    renderFeedActions: (feed: GridmasterCalendarFeed) =>
      button("Revoke", {
        input: { action: "revokeCalendarFeed", feedId: feed.id },
        title: "Revoke calendar feed",
        message:
          "Revoke this calendar feed? Its link stops working now. They can create a new one from their profile.",
        confirmLabel: "Revoke",
        success: "Calendar feed revoked",
      }),
    loginLockActions: button("Clear sign-in lock", {
      input: { action: "clearLoginLock" },
      title: "Clear sign-in lock",
      message:
        "Let them try to sign in again now? Another server may keep the lock for up to a minute.",
      confirmLabel: "Clear lock",
      success: "Sign-in lock cleared",
    }),
  } as const;
}
