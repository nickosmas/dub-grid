"use client";

import { useEffect, useRef } from "react";
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Auto-focus first enabled menu item on mount
  useEffect(() => {
    if (!menuRef.current) return;
    const firstItem = menuRef.current.querySelector<HTMLElement>(
      'button[role="menuitem"]:not([disabled])'
    );
    firstItem?.focus();
  }, []);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="dg-menu"
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
      style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
    >
      {canEdit && (
        <>
          <button
            role="menuitem"
            className="dg-menu-item"
            disabled={!hasShift}
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
            className="dg-menu-item"
            disabled={!hasClipboard}
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
              <div className="dg-menu-divider" />
              <button
                role="menuitem"
                className="dg-menu-item dg-menu-item--danger"
                onClick={() => {
                  onClear();
                  onClose();
                }}
              >
                <Trash2 size={14} />
                Remove Shift
              </button>
            </>
          )}
        </>
      )}
      {canRequest && hasShift && !hasActiveRequest && (
        <>
          {canEdit && <div className="dg-menu-divider" />}
          {onMakeAvailable && (
            <button
              role="menuitem"
              className="dg-menu-item dg-menu-item--accent"
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
              className="dg-menu-item dg-menu-item--accent"
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
          {canEdit && <div className="dg-menu-divider" />}
          <div
            style={{
              padding: "8px 14px",
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-warning-text)",
              fontStyle: "italic",
            }}
          >
            Request already active
          </div>
        </>
      )}
    </div>
  );
}
