"use client";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, ClipboardPaste, Trash2, UserPlus, ArrowLeftRight } from "lucide-react";

interface ShiftContextMenuProps {
  anchorEl: HTMLElement;
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
  anchorEl,
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
  useEffect(() => { onCloseRef.current = onClose; });

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [arrowLeft, setArrowLeft] = useState(0);
  const [flippedUp, setFlippedUp] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    const rect = anchorEl.getBoundingClientRect();
    const GAP = 8;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const flipUp = spaceBelow < 200;
    setFlippedUp(flipUp);

    const menuW = menuRef.current?.offsetWidth ?? 180;
    const menuLeft = Math.max(8, Math.min(
      rect.left + rect.width / 2 - menuW / 2,
      window.innerWidth - menuW - 8,
    ));

    setMenuStyle({
      position: "fixed",
      top: flipUp ? undefined : rect.bottom + GAP,
      bottom: flipUp ? window.innerHeight - rect.top + GAP : undefined,
      left: menuLeft,
      zIndex: 9999,
    });

    const anchorCenterX = rect.left + rect.width / 2;
    // Clamp arrow to stay inside the flat portion (outside the 12px border-radius)
    setArrowLeft(Math.max(20, Math.min(anchorCenterX - menuLeft, menuW - 20)));
  }, [anchorEl]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { updatePosition(); }, [updatePosition]);

  // Dismiss on scroll/resize — context menus are ephemeral
  useEffect(() => {
    const dismiss = () => onCloseRef.current();
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);

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

  if (!mounted) return null;

  return createPortal(
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
      style={{ ...menuStyle, overflow: "visible" }}
    >
      {/* Arrow — outer (border) */}
      <div style={{
        position: "absolute", left: arrowLeft - 7, width: 0, height: 0,
        borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
        ...(flippedUp
          ? { bottom: -6, borderTop: "6px solid var(--color-border)" }
          : { top: -6, borderBottom: "6px solid var(--color-border)" }),
      }} />
      {/* Arrow — inner (fill) */}
      <div style={{
        position: "absolute", left: arrowLeft - 6, width: 0, height: 0,
        borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
        ...(flippedUp
          ? { bottom: -5, borderTop: "5px solid var(--color-surface)" }
          : { top: -5, borderBottom: "5px solid var(--color-surface)" }),
      }} />

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
    </div>,
    document.body,
  );
}
