"use client";

import { Copy, ClipboardPaste, Trash2, UserPlus, ArrowLeftRight } from "lucide-react";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { useCloseOnWindowResize, usePopupCornerAlign } from "@/hooks/useAnchoredPopup";

interface ShiftContextMenuProps {
  anchorEl: HTMLElement;
  hasShift: boolean;
  hasClipboard: boolean;
  canEdit: boolean;
  /** Show coverage/swap actions (employee viewing own published shift). */
  canRequest: boolean;
  /** An active request already exists for this shift. */
  hasActiveRequest: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onNeedCoverage?: () => void;
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
  onNeedCoverage,
  onProposeSwap,
  onClose,
}: ShiftContextMenuProps) {
  useCloseOnWindowResize(onClose);

  const { align, alignOffset, sideOffset, popupRef } = usePopupCornerAlign(anchorEl, 192);

  return (
    <Menu
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <MenuContent
        ref={popupRef}
        anchor={anchorEl}
        side="bottom"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        positionMethod="fixed"
        collisionPadding={8}
        collisionAvoidance={{
          side: "flip",
          align: "none",
          fallbackAxisSide: "none",
        }}
        finalFocus={() => anchorEl}
      >
        {canEdit && (
          <>
            <MenuItem
              disabled={!hasShift}
              onClick={() => {
                onCopy();
              }}
            >
              <Copy size={14} />
              Copy Entry
            </MenuItem>
            <MenuItem
              disabled={!hasClipboard}
              onClick={() => {
                onPaste();
              }}
            >
              <ClipboardPaste size={14} />
              Paste Entry
            </MenuItem>
            {hasShift && (
              <>
                <div className="dg-menu-divider" />
                <MenuItem
                  className="dg-menu-item--danger"
                  onClick={() => {
                    onClear();
                  }}
                >
                  <Trash2 size={14} />
                  Remove Entry
                </MenuItem>
              </>
            )}
          </>
        )}
        {canRequest && hasShift && !hasActiveRequest && (
          <>
            {canEdit && <div className="dg-menu-divider" />}
            {onNeedCoverage && (
              <MenuItem
                className="dg-menu-item--accent"
                onClick={() => {
                  onNeedCoverage();
                }}
              >
                <UserPlus size={14} />
                Drop shift
              </MenuItem>
            )}
            {onProposeSwap && (
              <MenuItem
                className="dg-menu-item--accent"
                onClick={() => {
                  onProposeSwap();
                }}
              >
                <ArrowLeftRight size={14} />
                Swap
              </MenuItem>
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
                color: "var(--dg-color-warning-text)",
                fontStyle: "italic",
              }}
            >
              Request already active
            </div>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
