"use client";

import { useId, useRef } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

/**
 * Extra things the manager should know before confirming, one short point
 * each, in a box above the buttons. Context and the plain effect go in the
 * dialog's short message instead.
 */
export interface ConfirmSummary {
  /** A visible label above the box; none by default. */
  title?: string;
  points: React.ReactNode[];
}

interface ConfirmDialogProps {
  title: string;
  returnFocus?: React.RefObject<HTMLElement | null>;
  /** A short message under the title, and any fields the confirm needs. */
  message?: string | React.ReactNode;
  summary?: ConfirmSummary;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Colours the confirm button, so it has to describe the consequence rather
   * than the prominence:
   * - `danger` (red) destroys or removes something.
   * - `warning` (orange) has a side effect beyond the obvious one: archiving,
   *   revoking a live invitation, changing a role, signing other sessions out.
   * - `info` (brand) is an ordinary action. Every plain save, export, or
   *   confirm belongs here, however important the thing being saved is. A
   *   confirm dialog is already the caution; an orange button on a save reads
   *   as "this might go wrong" and spends the colour that real warnings need.
   */
  variant?: "danger" | "warning" | "info";
  /**
   * Adds the caller's pending state to the dialog's own async latch. Only needed when
   * the pending flag lives outside this confirm (a shared `actionLoading` keyed
   * by row, say); an async `onConfirm` already spins on its own.
   */
  isLoading?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  secondaryConfirmLabel?: string;
  onSecondaryConfirm?: () => void | Promise<unknown>;
  isSecondaryLoading?: boolean;
  /** `neutral` draws the second confirm like Cancel, for a choice that changes nothing extra. */
  secondaryConfirmTone?: "confirm" | "neutral";
  maxWidth?: number;
  wrapActions?: boolean;
  confirmDisabled?: boolean;
  secondaryConfirmDisabled?: boolean;
}

export default function ConfirmDialog({
  title,
  returnFocus,
  message,
  summary,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading,
  onConfirm,
  onCancel,
  secondaryConfirmLabel,
  onSecondaryConfirm,
  isSecondaryLoading,
  secondaryConfirmTone = "confirm",
  maxWidth = 420,
  wrapActions = false,
  confirmDisabled = false,
  secondaryConfirmDisabled = false,
}: ConfirmDialogProps) {
  // Confirming is the press most worth double-clicking: the dialog has just
  // told the user something irreversible is about to happen, and a slow
  // request leaves the button sitting there looking unpressed. The latch is
  // synchronous, so the second click is dropped before React can re-render;
  // `isRunning` also blocks dismissal. A caller's `isLoading` can keep the
  // dialog busy longer; a synchronous `onConfirm` never spins on its own.
  const confirm = useAsyncAction(onConfirm);
  const secondaryConfirm = useAsyncAction(onSecondaryConfirm ?? (() => {}));

  const confirmBusy = Boolean(isLoading || confirm.isRunning);
  const secondaryBusy = Boolean(isSecondaryLoading || secondaryConfirm.isRunning);

  const confirmClass =
    variant === "danger" ? "dg-btn dg-btn-danger-filled" : "dg-btn dg-btn-primary";

  const confirmStyle: React.CSSProperties | undefined =
    variant === "warning" ? { background: "var(--dg-color-warning)", border: "none" } : undefined;

  const descId = useId();
  // Opening on Cancel, not the close button now in the corner: the safe
  // choice is the one a stray Enter takes.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionDisabled = confirmBusy || secondaryBusy;
  const cancelButtonStyle = wrapActions ? { marginRight: "auto", minWidth: 120 } : undefined;
  const confirmButtonStyle = wrapActions
    ? {
        ...confirmStyle,
        minWidth: secondaryConfirmLabel && onSecondaryConfirm ? 170 : 148,
      }
    : confirmStyle;

  return (
    <Modal
      title={title}
      returnFocus={returnFocus}
      initialFocus={cancelRef}
      onClose={onCancel}
      onRequestClose={() => !actionDisabled}
      style={{ maxWidth }}
      aria-describedby={descId}
    >
      <div
        id={descId}
        style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}
      >
        {message ? (
          <div
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {message}
          </div>
        ) : null}
        {summary && summary.points.length === 1 ? (
          // A box with one item reads oddly; a lone fact reads as a sentence.
          <div
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {summary.points[0]}
          </div>
        ) : null}
        {summary && summary.points.length > 1 ? <ConfirmSummaryBox summary={summary} /> : null}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: wrapActions ? "wrap" : "nowrap",
          gap: 12,
          justifyContent: "flex-end",
          alignItems: "stretch",
        }}
      >
        <Button
          ref={cancelRef}
          className="dg-btn dg-btn-secondary"
          onClick={onCancel}
          disabled={actionDisabled}
          style={cancelButtonStyle}
        >
          {cancelLabel}
        </Button>
        {secondaryConfirmLabel && onSecondaryConfirm && (
          <Button
            className={
              secondaryConfirmTone === "neutral" ? "dg-btn dg-btn-secondary" : confirmClass
            }
            style={secondaryConfirmTone === "neutral" ? undefined : confirmButtonStyle}
            onClick={secondaryConfirm.run}
            disabled={actionDisabled || secondaryConfirmDisabled}
          >
            <ButtonLoading loading={secondaryBusy} spinnerSize={16}>
              {secondaryConfirmLabel}
            </ButtonLoading>
          </Button>
        )}
        <Button
          className={confirmClass}
          style={confirmButtonStyle}
          onClick={confirm.run}
          disabled={actionDisabled || confirmDisabled}
        >
          <ButtonLoading loading={confirmBusy} spinnerSize={16}>
            {confirmLabel}
          </ButtonLoading>
        </Button>
      </div>
    </Modal>
  );
}

/** The publish dialog's summary box: the extra things a confirm does that the manager should know. */
export function ConfirmSummaryBox({ summary }: { summary: ConfirmSummary }) {
  // No visible label by default (the owner dropped it); the region keeps a
  // name for screen readers. A caller can still show one with `title`.
  return (
    <section
      aria-label={summary.title ?? "Keep in mind"}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {summary.title ? (
        <h3
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-body-sm)",
            fontWeight: 600,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {summary.title}
        </h3>
      ) : null}
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "4px 16px",
          border: "1px solid var(--dg-color-border)",
          borderRadius: 14,
          background: "var(--dg-color-bg)",
        }}
      >
        {summary.points.map((point, index) => (
          <li
            key={index}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              padding: "8px 0",
              borderTop: index === 0 ? undefined : "1px solid var(--dg-color-border-light)",
              fontSize: "var(--dg-fs-body-sm)",
              lineHeight: 1.45,
              color: "var(--dg-color-text-primary)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--dg-color-text-subtle)",
                flexShrink: 0,
                transform: "translateY(-2px)",
              }}
            />
            <span style={{ minWidth: 0 }}>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
