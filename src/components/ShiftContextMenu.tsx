"use client";

import React, { useEffect, useRef } from "react";
import { Copy, ClipboardPaste, Trash2 } from "lucide-react";

interface ShiftContextMenuProps {
  x: number;
  y: number;
  hasShift: boolean;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function ShiftContextMenu({
  x,
  y,
  hasShift,
  hasClipboard,
  onCopy,
  onPaste,
  onClear,
  onClose,
}: ShiftContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 9999,
    background: "#fff",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    boxShadow:
      "0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
    padding: "4px 0",
    minWidth: 160,
    animation: "ctxMenuFadeIn 0.1s ease-out",
  };

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    border: "none",
    background: "none",
    width: "100%",
    textAlign: "left",
  };

  const disabledStyle: React.CSSProperties = {
    ...itemStyle,
    opacity: 0.4,
    cursor: "default",
    pointerEvents: "none",
  };

  return (
    <>
      <style>{`
        @keyframes ctxMenuFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div ref={menuRef} style={menuStyle}>
        <button
          style={hasShift ? itemStyle : disabledStyle}
          onMouseEnter={(e) => {
            if (hasShift) e.currentTarget.style.background = "#F1F5F9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
          onClick={() => {
            onCopy();
            onClose();
          }}
        >
          <Copy size={14} />
          Copy Shift
        </button>
        <button
          style={hasClipboard ? itemStyle : disabledStyle}
          onMouseEnter={(e) => {
            if (hasClipboard) e.currentTarget.style.background = "#F1F5F9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
          onClick={() => {
            onPaste();
            onClose();
          }}
        >
          <ClipboardPaste size={14} />
          Paste Shift
        </button>
        {hasShift && (
          <>
            <div
              style={{
                height: 1,
                background: "var(--color-border-light)",
                margin: "4px 0",
              }}
            />
            <button
              style={{ ...itemStyle, color: "#DC2626" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FEF2F2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              <Trash2 size={14} />
              Clear Shift
            </button>
          </>
        )}
      </div>
    </>
  );
}
