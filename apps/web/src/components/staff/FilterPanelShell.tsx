"use client";

import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/Button";
import { useMediaQuery, MOBILE } from "@/hooks";

/**
 * The directory's filter panel: a popover on desktop, a bottom sheet on
 * mobile, with the Clear all / Done footer both halves of the directory share.
 *
 * The staff list and the management roster describe different populations, so
 * each fills this with the filters its own rows can answer — but they stay one
 * control rather than two lookalikes drifting apart.
 */
export function FilterPanelShell({
  open,
  onClose,
  anchorRef,
  title,
  widthClassName = "w-[560px]",
  hasActiveFilters,
  onClearAll,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  /** Names the sheet for screen readers; never shown on desktop. */
  title: string;
  widthClassName?: string;
  hasActiveFilters: boolean;
  onClearAll: () => void;
  children: ReactNode;
}) {
  const isMobile = useMediaQuery(MOBILE);

  const content = (
    <div className="flex max-h-[inherit] flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>

      <div className="flex items-center justify-between border-t border-[var(--dg-color-border-light)] px-4 py-3">
        <Button
          type="button"
          onClick={onClearAll}
          disabled={!hasActiveFilters}
          className={`text-xs font-semibold transition-colors ${
            hasActiveFilters
              ? "text-[var(--dg-color-text-muted)] hover:text-[var(--dg-color-text-primary)]"
              : "cursor-not-allowed text-[var(--dg-color-text-faint)]"
          }`}
        >
          Clear all
        </Button>
        <Button
          type="button"
          onClick={onClose}
          className="rounded-[var(--dg-radius-sm)] bg-[var(--dg-color-brand)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Done
        </Button>
      </div>
    </div>
  );

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
          className="max-h-[75vh] gap-0 rounded-t-2xl p-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-8 rounded-full bg-[var(--dg-color-border)]" />
          </div>
          {content}
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
          sideOffset={4}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className={`flex max-h-[70vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[var(--dg-radius-lg)] border border-[var(--dg-color-border)] bg-[var(--dg-color-surface)] shadow-[var(--shadow-menu)] outline-hidden ${widthClassName}`}
          >
            {content}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[var(--dg-color-border-light)] py-4 first:pt-1 last:border-b-0">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--dg-color-text-subtle)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 w-full last:mb-0">
      <div className="mb-1.5 text-[11px] font-semibold text-[var(--dg-color-text-muted)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// Interactive sibling of <StatusPill>: same tonal language, but a toggleable button.
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
        active
          ? "border-[var(--dg-color-brand-border)] bg-[var(--dg-color-brand-bg)] text-[var(--dg-color-brand)]"
          : "border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg-secondary)] text-[var(--dg-color-text-secondary)] hover:bg-[var(--dg-color-border-light)]"
      }`}
    >
      {children}
    </Button>
  );
}
