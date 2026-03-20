"use client";

import { useCallback, useRef, useEffect } from "react";
import React from "react";
import { useMediaQuery, MOBILE } from "@/hooks";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export default function Modal({ title, onClose, children, style }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery(MOBILE);

  // Auto-focus the modal on open for keyboard accessibility
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  return (
    <div
      className="dg-modal-overlay"
      onClick={onClose}
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
            onClick={onClose}
            aria-label="Close modal"
            className="dg-btn dg-btn-ghost"
            style={{ fontSize: "var(--dg-fs-card-title)", lineHeight: 1, padding: isMobile ? "8px 10px" : "2px 6px", minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
