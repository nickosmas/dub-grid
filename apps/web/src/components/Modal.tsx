"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import React from "react";
import { CloseButton } from "@/components/ui/CloseButton";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onRequestClose?: () => boolean;
  showCloseButton?: boolean;
  /** When true, clicking the backdrop does not close the modal. */
  disableOverlayClose?: boolean;
  /**
   * When true, the overlay starts below the sticky app header so the top
   * nav remains visible and clickable. Use for non-blocking detail views.
   */
  headerSafe?: boolean;
  "aria-describedby"?: string;
}

export default function Modal({
  title,
  onClose,
  children,
  className,
  style,
  onRequestClose,
  showCloseButton = true,
  disableOverlayClose = false,
  headerSafe = false,
  "aria-describedby": ariaDescribedby,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [closing, setClosing] = useState(false);

  // Auto-focus first interactive child, fall back to dialog container
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus();
    else dialog.focus();
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Clear timeout on unmount to prevent stale onClose calls
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Animated close — ref guard prevents double-fire race condition
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    if (onRequestClose && !onRequestClose()) return;
    closingRef.current = true;
    setClosing(true);
    timeoutRef.current = setTimeout(() => onClose(), 150);
  }, [onClose, onRequestClose]);

  // Keyboard: Escape to close + focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
        return;
      }

      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [handleClose],
  );

  return createPortal(
    <div
      className={`dg-modal-overlay${closing ? " closing" : ""}${headerSafe ? " is-header-safe" : ""}`}
      onClick={disableOverlayClose ? undefined : handleClose}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={ariaDescribedby}
        className={`dg-modal${className ? ` ${className}` : ""}`}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dg-modal-header">
          <span className="dg-modal-title">{title}</span>
          {showCloseButton ? (
            <CloseButton size="lg" onClick={handleClose} aria-label="Close modal" />
          ) : null}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
