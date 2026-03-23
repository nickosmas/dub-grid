"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import React from "react";
import { useMediaQuery, MOBILE } from "@/hooks";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export default function Modal({ title, onClose, children, style }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isMobile = useMediaQuery(MOBILE);
  const [closing, setClosing] = useState(false);

  // Auto-focus first interactive child, fall back to dialog container
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus();
    else dialog.focus();
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
    closingRef.current = true;
    setClosing(true);
    timeoutRef.current = setTimeout(() => onClose(), 150);
  }, [onClose]);

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
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
        );
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
    [handleClose]
  );

  return (
    <div
      className={`dg-modal-overlay${closing ? " closing" : ""}`}
      onClick={handleClose}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dg-modal"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "var(--dg-fs-title)",
              color: "var(--color-text-primary)",
            }}
          >
            {title}
          </span>
          <button
            onClick={handleClose}
            aria-label="Close modal"
            className="dg-btn dg-btn-ghost"
            style={{ fontSize: "var(--dg-fs-card-title)", lineHeight: 1, padding: isMobile ? "8px 10px" : "2px 6px", minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
