"use client";

import { useCallback, useRef, useEffect } from "react";
import React from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

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
      style={{
        position: "fixed", inset: 0, background: "rgba(10,20,40,0.45)",
        backdropFilter: "blur(4px)", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
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
        style={{
          background: "#fff", borderRadius: 16, padding: "28px 32px",
          minWidth: 320, maxWidth: 440,
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)", border: "1px solid var(--color-border)",
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--color-text-primary)" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-subtle)", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
