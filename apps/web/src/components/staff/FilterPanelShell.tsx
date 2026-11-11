"use client";

import { useId, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { useMediaQuery, MOBILE } from "@/hooks";

/** Keeps the panel clear of the 56px app header when it opens near the top. */
const COLLISION_PADDING = { top: 64, right: 8, bottom: 8, left: 8 };

/**
 * The directory's filter panel: a popover on desktop, a bottom sheet on a
 * phone. The staff list and the management roster fill it with the filters
 * their own rows can answer.
 */
export function FilterPanelShell({
  open,
  onClose,
  anchorRef,
  hasActiveFilters,
  onClearAll,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  hasActiveFilters: boolean;
  onClearAll: () => void;
  children: ReactNode;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const titleId = useId();

  const body = (
    <>
      <div className="dg-filter-panel-body">{children}</div>
      <div className="dg-footer-bar dg-filter-panel-footer">
        <Button
          type="button"
          className="dg-btn dg-btn-secondary"
          onClick={onClearAll}
          disabled={!hasActiveFilters}
        >
          Clear filters
        </Button>
        <Button type="button" className="dg-btn dg-btn-primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
  const close = <CloseButton aria-label="Close filters" onClick={onClose} />;

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="dg-filter-panel dg-filter-panel--sheet"
        >
          <div className="dg-filter-panel-header">
            <SheetTitle className="dg-modal-title">Filters</SheetTitle>
            {close}
          </div>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchorRef}
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={COLLISION_PADDING}
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            aria-labelledby={titleId}
            className="dg-filter-panel dg-filter-panel--popover"
          >
            <div className="dg-filter-panel-header">
              <h2 id={titleId} className="dg-modal-title">
                Filters
              </h2>
              {close}
            </div>
            {body}
            <ScrollOverflowCue />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** One filter: its name, then the control that answers it. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dg-filter-field">
      <span className="dg-filter-field-label">{label}</span>
      <div className="dg-filter-field-control">{children}</div>
    </div>
  );
}

export function FilterDivider() {
  return <div className="dg-filter-divider" aria-hidden="true" />;
}
