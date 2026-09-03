"use client";

import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import Modal from "@/components/Modal";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export function ScheduleSessionWarning({
  sessionCount,
  onEndOtherSessions,
  onSignOutThisDevice,
}: {
  sessionCount: number;
  onEndOtherSessions: () => Promise<unknown>;
  onSignOutThisDevice: () => void;
}) {
  const endOtherSessions = useAsyncAction(onEndOtherSessions);
  const sessionLabel =
    sessionCount === 1 ? "1 other tab or device" : `${sessionCount} other tabs or devices`;

  return (
    <div
      className="dg-draft-banner no-print"
      role="alert"
      style={{
        background: "var(--dg-color-danger-bg)",
        borderColor: "var(--dg-color-danger-border)",
        color: "var(--dg-color-danger-text)",
      }}
    >
      <div className="dg-draft-banner-dot" style={{ background: "var(--dg-color-danger)" }} />
      <strong>Schedule open elsewhere</strong>
      <span>
        Your account has this schedule open in {sessionLabel}. End those schedule sessions before
        editing here to avoid conflicting unsaved changes. Those devices will stay signed in.
      </span>
      <div className="dg-draft-banner-actions">
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-sm"
          onClick={onSignOutThisDevice}
          disabled={endOtherSessions.isRunning}
        >
          Sign out this device
        </Button>
        <Button
          type="button"
          className="dg-btn dg-btn-danger dg-btn-sm"
          onClick={endOtherSessions.run}
          disabled={endOtherSessions.isRunning}
        >
          <ButtonLoading loading={endOtherSessions.isRunning} spinnerSize={14}>
            End other schedule sessions
          </ButtonLoading>
        </Button>
      </div>
    </div>
  );
}

/**
 * Escape hatch for a cell another person holds.
 *
 * Unlike the same-account takeover this ends nothing: the other editor keeps
 * their session and their work. It only lets this user into the same cell, so
 * an advisory lock can never become a dead end. The database version check
 * remains the real guard against a conflicting write.
 */
export function ScheduleCellBusyDialog({
  editorName,
  cellDescription,
  onEditAnyway,
  onCancel,
}: {
  editorName: string;
  cellDescription: string | null;
  onEditAnyway: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title="Someone else is editing this cell"
      onClose={onCancel}
      aria-describedby="schedule-cell-busy-description"
    >
      <div className="space-y-5 p-1">
        <div
          id="schedule-cell-busy-description"
          className="space-y-2 text-sm leading-6 text-[var(--dg-color-text-secondary)]"
        >
          <p>
            {cellDescription
              ? `${editorName} is editing ${cellDescription} right now.`
              : `${editorName} is editing this cell right now.`}
          </p>
          <p>
            You can wait for them to finish, or edit it anyway. If you both save, whoever saves last
            will be asked to review the other person's changes first.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" className="dg-btn dg-btn-secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="dg-btn dg-btn-primary" onClick={onEditAnyway}>
            Edit anyway
          </Button>
        </div>
      </div>
    </Modal>
  );
}

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
