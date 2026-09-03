"use client";

import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import Modal from "@/components/Modal";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function ScheduleSessionConflictDialog({
  onUseThisTab,
  onCancel,
  onSignOutThisDevice,
}: {
  onUseThisTab: () => Promise<unknown>;
  onCancel: () => void;
  onSignOutThisDevice: () => void;
}) {
  const useThisTab = useAsyncAction(onUseThisTab);

  return (
    <Modal
      title="Open in another tab or device"
      onClose={onCancel}
      aria-describedby="schedule-session-conflict-description"
      disableOverlayClose={useThisTab.isRunning}
    >
      <div className="space-y-5 p-1">
        <div
          id="schedule-session-conflict-description"
          className="space-y-2 text-sm leading-6 text-[var(--dg-color-text-secondary)]"
        >
          <p>This cell is being edited in another schedule session for your account.</p>
          <p>
            Use this tab to end only that schedule editor. The other tab or device stays signed in,
            but any unsaved schedule changes there will not be saved.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={onCancel}
            disabled={useThisTab.isRunning}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={onSignOutThisDevice}
            disabled={useThisTab.isRunning}
          >
            Sign out this device
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={useThisTab.run}
            disabled={useThisTab.isRunning}
          >
            <ButtonLoading loading={useThisTab.isRunning} spinnerSize={16}>
              Use this tab
            </ButtonLoading>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ScheduleSessionEndedDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Schedule session ended"
      onClose={onClose}
      aria-describedby="schedule-session-ended-description"
    >
      <div className="space-y-5 p-1">
        <p
          id="schedule-session-ended-description"
          className="text-sm leading-6 text-[var(--dg-color-text-secondary)]"
        >
          This schedule editor was ended from another tab or device. Any unsaved changes in this tab
          were not saved. Reload the page when you want to start a new schedule session.
        </p>
        <div className="flex justify-end">
          <Button type="button" className="dg-btn dg-btn-primary" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
