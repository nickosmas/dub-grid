"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ScrollCueButton } from "@/components/ui/scroll-cue-button";

function Table({
  className,
  showScrollCues = false,
  scrollLabel = "table",
  scrollable = true,
  ...props
}: React.ComponentProps<"table"> & {
  showScrollCues?: boolean;
  scrollLabel?: string;
  /**
   * Opt out of the horizontal scroll container. A scroll container is a
   * containing block for sticky descendants, so a table with sticky headings
   * has to scroll with the page instead and drop columns on narrow screens.
   */
  scrollable?: boolean;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const cuesEnabled = showScrollCues && scrollable;

  const updateScrollState = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element || !cuesEnabled) return;
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(element.scrollLeft < element.scrollWidth - element.clientWidth - 4);
  }, [cuesEnabled]);

  React.useEffect(() => {
    updateScrollState();
    const element = scrollRef.current;
    if (!element || !cuesEnabled) return;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState);
    observer?.observe(element);
    element.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, cuesEnabled]);

  const scroll = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(160, Math.floor(element.clientWidth * 0.8)),
      behavior: "smooth",
    });
  };

  return (
    <div data-slot="table-scroll-shell" className="relative w-full">
      <div
        ref={scrollRef}
        data-slot="table-container"
        className={cn("relative w-full", scrollable && "overflow-x-auto")}
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
      {cuesEnabled && canScrollLeft && (
        <TableScrollCue
          direction="left"
          label={`Scroll ${scrollLabel} left`}
          onClick={() => scroll(-1)}
        />
      )}
      {cuesEnabled && canScrollRight && (
        <TableScrollCue
          direction="right"
          label={`Scroll ${scrollLabel} right`}
          onClick={() => scroll(1)}
        />
      )}
    </div>
  );
}

function TableScrollCue({
  direction,
  label,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      className="absolute top-1/2 z-10 -translate-y-1/2"
      style={{
        [direction]: 12,
      }}
    >
      <ScrollCueButton direction={direction} label={label} onClick={onClick} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted data-[state=selected]:bg-[var(--dg-color-nav-active-bg)]",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, style, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "dg-type-table-heading h-10 px-2 text-left align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      style={{
        color: "var(--dg-type-table-heading-color)",
        fontSize: "var(--dg-type-table-heading-size)",
        fontWeight: "var(--dg-type-table-heading-weight)",
        letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
        lineHeight: "var(--dg-type-table-heading-line-height)",
        textTransform: "none",
        ...style,
      }}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
