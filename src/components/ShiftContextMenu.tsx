"use client";

import React, { useEffect, useRef } from "react";
import { Copy, ClipboardPaste, Trash2, UserPlus, ArrowLeftRight } from "lucide-react";

interface ShiftContextMenuProps {
  x: number;
  y: number;
  hasShift: boolean;
  hasClipboard: boolean;
  canEdit: boolean;
  /** Show pickup/swap actions (employee viewing own published shift). */
  canRequest: boolean;
  /** An active request already exists for this shift. */
  hasActiveRequest: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onMakeAvailable?: () => void;
  onProposeSwap?: () => void;
  onClose: () => void;
}

export default function ShiftContextMenu({
  x,
  y,
  hasShift,
  hasClipboard,
  canEdit,
  canRequest,
  hasActiveRequest,
  onCopy,
  onPaste,
  onClear,
  onMakeAvailable,
  onProposeSwap,
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
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Auto-focus first enabled menu item on mount
  useEffect(() => {
    if (!menuRef.current) return;
    const firstItem = menuRef.current.querySelector<HTMLElement>(
      'button[role="menuitem"]:not([disabled])'
    );
    firstItem?.focus();
  }, []);

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
      <div
        ref={menuRef}
        role="menu"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            const items = Array.from(
              menuRef.current?.querySelectorAll<HTMLElement>(
                'button[role="menuitem"]:not([disabled])'
              ) ?? []
            );
            if (items.length === 0) return;
            const currentIdx = items.indexOf(document.activeElement as HTMLElement);
            const nextIdx =
              e.key === "ArrowDown"
                ? (currentIdx + 1) % items.length
                : (currentIdx - 1 + items.length) % items.length;
            items[nextIdx].focus();
          }
        }}
        style={menuStyle}
      >
        {canEdit && (
          <>
            <button
              role="menuitem"
              disabled={!hasShift}
              style={hasShift ? itemStyle : disabledStyle}
              onMouseEnter={(e) => {
                if (hasShift) e.currentTarget.style.background = "var(--color-surface-overlay)";
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
              role="menuitem"
              disabled={!hasClipboard}
              style={hasClipboard ? itemStyle : disabledStyle}
              onMouseEnter={(e) => {
                if (hasClipboard) e.currentTarget.style.background = "var(--color-surface-overlay)";
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
                  role="menuitem"
                  style={{ ...itemStyle, color: "var(--color-danger)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-danger-bg)";
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
          </>
        )}
        {canRequest && hasShift && !hasActiveRequest && (
          <>
            {canEdit && (
              <div
                style={{
                  height: 1,
                  background: "var(--color-border-light)",
                  margin: "4px 0",
                }}
              />
            )}
            {onMakeAvailable && (
              <button
                role="menuitem"
                style={{ ...itemStyle, color: "var(--color-link)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-info-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
                onClick={() => {
                  onMakeAvailable();
                  onClose();
                }}
              >
                <UserPlus size={14} />
                Make available for pickup
              </button>
            )}
            {onProposeSwap && (
              <button
                role="menuitem"
                style={{ ...itemStyle, color: "var(--color-accent-text)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-accent-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
                onClick={() => {
                  onProposeSwap();
                  onClose();
                }}
              >
                <ArrowLeftRight size={14} />
                Propose a swap
              </button>
            )}
          </>
        )}
        {canRequest && hasShift && hasActiveRequest && (
          <>
            {canEdit && (
              <div
                style={{
                  height: 1,
                  background: "var(--color-border-light)",
                  margin: "4px 0",
                }}
              />
            )}
            <div
              style={{
                padding: "8px 14px",
                fontSize: 12,
                color: "var(--color-warning-text)",
                fontStyle: "italic",
              }}
            >
              Request already active
            </div>
          </>
        )}
      </div>
    </>
  );
}
