"use client";

import {
  Copy,
  ClipboardPaste,
  Trash2,
  UserPlus,
  ArrowLeftRight,
  CalendarOff,
  Eye,
} from "lucide-react";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { useCloseOnWindowResize, usePopupCornerAlign } from "@/hooks/useAnchoredPopup";

interface ShiftContextMenuProps {
  anchorEl: HTMLElement;
  hasShift: boolean;
  hasClipboard: boolean;
  canEdit: boolean;
  /** Show coverage/swap actions (employee viewing own published shift). */
  canRequest: boolean;
  /** The viewer's own request is already active for this shift. */
  hasActiveRequest: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onNeedCoverage?: () => void;
  onProposeSwap?: () => void;
  /** Opens the call-off flow; omitted when no absence can be chosen. */
  onCallOff?: () => void;
  /** Opens the active request. */
  onViewRequest?: () => void;
  onClose: () => void;
}

export type ShiftRequestMenuState = "request" | "active" | "none";

/**
 * What the menu offers for requests: the actions on the viewer's own
 * requestable shift, or the request already on it. A request stays viewable
 * after the shift starts, when nothing new can be asked for.
 */
export function resolveShiftRequestMenuState(input: {
  isOwnShift: boolean;
  canRequest: boolean;
  hasActiveRequest: boolean;
}): ShiftRequestMenuState {
  if (!input.isOwnShift) return "none";
  if (input.hasActiveRequest) return "active";
  return input.canRequest ? "request" : "none";
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
  onCallOff,
  onViewRequest,
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
              Copy
            </MenuItem>
            <MenuItem
              disabled={!hasClipboard}
              onClick={() => {
                onPaste();
              }}
            >
              <ClipboardPaste size={14} />
              Paste
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
                  Clear day
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
            {onCallOff && (
              <MenuItem
                className="dg-menu-item--danger"
                onClick={() => {
                  onCallOff();
                }}
              >
                <CalendarOff size={14} />
                Call off
              </MenuItem>
            )}
          </>
        )}
        {hasShift && hasActiveRequest && (
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
            {onViewRequest && (
              <MenuItem
                className="dg-menu-item--accent"
                onClick={() => {
                  onViewRequest();
                }}
              >
                <Eye size={14} />
                View request
              </MenuItem>
            )}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
