"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DAY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Fixed widths, so a placeholder list reads as varied text without changing
// shape between renders.
const TITLE_WIDTHS = ["w-[38%]", "w-[52%]", "w-[44%]", "w-[60%]", "w-[34%]", "w-[48%]"];
const DETAIL_WIDTHS = ["w-24", "w-32", "w-28", "w-20", "w-36", "w-24"];

function pick(widths: string[], index: number) {
  return widths[index % widths.length];
}

/** Rows in a card: a date column, a title and its detail, like the staff page's lists. */
export function ListRowsSkeleton({
  rows = 5,
  dateColumn = "narrow",
  weekHeadings = false,
  label,
}: {
  rows?: number;
  dateColumn?: "narrow" | "wide";
  /** Breaks the rows under a heading strip every few rows, as the Schedule tab's weeks do. */
  weekHeadings?: boolean;
  label: string;
}) {
  const columns =
    dateColumn === "wide"
      ? "sm:grid-cols-[130px_minmax(0,1fr)_auto]"
      : "sm:grid-cols-[90px_minmax(0,1fr)_auto]";
  return (
    <div className="dg-card overflow-hidden" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index}>
          {weekHeadings && index % 3 === 0 ? (
            <div
              className={cn(
                "bg-[var(--dg-color-bg-secondary)] px-5 pb-2 pt-3",
                index > 0 && "border-t border-[var(--dg-color-border)]",
              )}
            >
              <Skeleton className="h-3.5 w-40 dg-skeleton--on-muted" />
            </div>
          ) : null}
          <div
            className={cn(
              "grid grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-3.5",
              columns,
              (index > 0 || weekHeadings) && "border-t border-[var(--dg-color-border-light)]",
            )}
          >
            <Skeleton className="h-3.5 w-16" />
            <span className="flex min-w-0 items-center gap-3">
              <Skeleton className={cn("h-3.5", pick(TITLE_WIDTHS, index))} />
              <Skeleton className={cn("h-3", pick(DETAIL_WIDTHS, index))} />
            </span>
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Request cards in a wrapping grid: a name and a pill, then two lines of detail. */
export function CardGridSkeleton({
  cards = 6,
  singleColumn = false,
  label,
}: {
  cards?: number;
  singleColumn?: boolean;
  label: string;
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-2.5",
        singleColumn ? "grid-cols-1" : "grid-cols-[repeat(auto-fill,minmax(340px,1fr))]",
      )}
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border)] bg-[var(--dg-color-surface)] px-4 py-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className={cn("h-4", pick(DETAIL_WIDTHS, index + 2))} />
            <Skeleton className="h-5 w-16 dg-skeleton--round" />
          </div>
          <Skeleton className={cn("h-3", pick(TITLE_WIDTHS, index + 1))} />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

const TABLE_COLUMNS = 5;

/** A report table: a header row and striped rows of cells. */
export function TableSkeleton({ rows = 8, label }: { rows?: number; label: string }) {
  return (
    <div
      className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border)] bg-[var(--dg-color-surface)]"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid grid-cols-5 gap-4 border-b border-[var(--dg-color-border)] px-3.5 py-3.5">
        {Array.from({ length: TABLE_COLUMNS }, (_, column) => (
          <Skeleton key={column} className="h-3 w-[55%]" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className={cn(
            "grid grid-cols-5 gap-4 border-b border-[var(--dg-color-border-subtle)] px-3.5 py-3.5 last:border-b-0",
            row % 2 === 1 && "bg-[var(--dg-color-bg-secondary)]",
          )}
        >
          {Array.from({ length: TABLE_COLUMNS }, (_, column) => (
            <Skeleton
              key={column}
              className={cn(
                "h-3.5",
                column === 0 ? pick(TITLE_WIDTHS, row + 3) : pick(DETAIL_WIDTHS, row + column),
                row % 2 === 1 && "dg-skeleton--on-muted",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The staff page and My profile before their person loads: header, status
 * card, tabs and the Overview's first cards, at the loaded page's sizes.
 */
export function PersonPageSkeleton({
  variant,
  tabCount,
}: {
  variant: "staff" | "profile";
  tabCount: number;
}) {
  return (
    <div
      className="h-[calc(100dvh-var(--dg-app-shell-header-height))] overflow-y-auto px-[var(--dg-page-gutter)] py-4 md:py-6 xl:py-8"
      aria-busy="true"
      aria-label={variant === "staff" ? "Loading this person" : "Loading your profile"}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <header className="flex flex-col gap-6">
          {variant === "staff" ? (
            <Link
              href="/people"
              className="inline-flex w-fit items-center gap-1.5 text-[length:var(--dg-type-navigation-size)] font-medium text-[var(--dg-type-navigation-color)] transition-colors hover:text-[var(--dg-color-text-secondary)]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back to People
            </Link>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <Skeleton className="h-[72px] w-[72px] shrink-0 dg-skeleton--round" />
              <div className="flex min-w-0 flex-col gap-3">
                <Skeleton className="h-7 w-56 max-w-full" />
                <Skeleton className="h-4 w-80 max-w-full" />
                {variant === "profile" ? <Skeleton className="h-3.5 w-52 max-w-full" /> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {variant === "staff" ? <Skeleton className="h-9 w-52" /> : null}
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </header>

        <div className="dg-card flex items-center gap-3 px-3.5 py-3.5">
          <Skeleton className="h-8 w-8 shrink-0 dg-skeleton--round" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton
              className={cn(
                "h-[38px] max-w-full dg-skeleton--control",
                tabCount > 3 ? "w-[388px]" : "w-[294px]",
              )}
            />
            {variant === "staff" ? (
              <Skeleton className="h-[38px] w-[340px] max-w-full dg-skeleton--control" />
            ) : (
              <Skeleton className="h-3.5 w-28" />
            )}
          </div>

          <div className="dg-card grid grid-cols-3">
            {[0, 1, 2].map((cell) => (
              <div
                key={cell}
                className={cn(
                  "flex flex-col gap-3 px-5 py-5",
                  cell > 0 && "border-l border-[var(--dg-color-border)]",
                )}
              >
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-7 w-14" />
              </div>
            ))}
          </div>

          <Skeleton className="mt-4 h-5 w-20" />
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div key={card} className="dg-card flex flex-col">
                <div className="border-b border-[var(--dg-color-border)] px-5 py-4">
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5">
                  {[0, 1, 2, 3].map((field) => (
                    <div key={field} className="flex flex-col gap-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className={cn("h-3.5", pick(DETAIL_WIDTHS, card + field))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const DIRECTORY_ROW_WIDTHS = ["w-36", "w-32", "w-40", "w-28", "w-36", "w-44", "w-32", "w-28"];

/**
 * The People directory before its roster loads: the sub-navigation, title,
 * summary cards, toolbar and table rows, at the loaded page's sizes.
 */
export function PeopleDirectorySkeleton({
  withSidebar,
  sidebarCollapsed,
  showSummaries,
  showDirectory = true,
  certificationCards = 6,
}: {
  withSidebar: boolean;
  sidebarCollapsed: boolean;
  showSummaries: boolean;
  /** One per certification plus Certified staff and Not certified, once known. */
  certificationCards?: number;
  /** False on the Requests and Recurring sections, which keep only the navigation. */
  showDirectory?: boolean;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--dg-app-shell-header-height))]" aria-busy="true">
      {withSidebar ? (
        <div
          aria-hidden
          className={cn(
            "flex shrink-0 flex-col gap-2 border-r border-[var(--dg-color-border)] bg-[var(--dg-color-surface)] px-2 pt-4",
            sidebarCollapsed ? "w-12" : "w-64",
          )}
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex h-9 items-center gap-2 px-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              {sidebarCollapsed ? null : (
                <Skeleton className={cn("h-3.5", item === 2 ? "w-28" : "w-20")} />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {showDirectory ? (
        <div
          className="min-w-0 flex-1 px-[var(--dg-page-gutter)] py-4 md:py-6 lg:py-10"
          aria-label="Loading the directory"
        >
          <div className="space-y-8">
            <div>
              <h1 className="text-[length:var(--dg-type-page-title-size)] font-bold tracking-tight text-[var(--dg-color-text-primary)]">
                Directory
              </h1>
              {/* The description's own color, so the heading reads over it as
                  it will once the real line lands. */}
              <div className="mt-2.5 text-[var(--dg-color-text-muted)]">
                <Skeleton className="h-3.5 w-72 max-w-full" />
              </div>
            </div>

            {showSummaries ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[0, 1, 2].map((card) => (
                    <div
                      key={card}
                      className="dg-card flex h-[78px] items-center justify-between px-3"
                    >
                      <div className="flex flex-col gap-2.5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-6 w-10" />
                      </div>
                      <Skeleton className="h-10 w-10 dg-skeleton--round" />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {Array.from({ length: certificationCards }, (_, card) => (
                    <div
                      key={card}
                      className="dg-card flex h-[78px] w-[133px] flex-col justify-center gap-2.5 px-3"
                    >
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-6 w-8" />
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-[38px] w-40 dg-skeleton--control" />
                <Skeleton className="h-[38px] w-36 dg-skeleton--control" />
                <Skeleton className="h-[38px] w-[400px] max-w-full dg-skeleton--control" />
                <Skeleton className="h-[38px] w-[90px] dg-skeleton--control" />
                <Skeleton className="h-[38px] w-[108px] dg-skeleton--control" />
              </div>
              <Skeleton className="h-[38px] w-[380px] max-w-full dg-skeleton--control" />
              {showSummaries ? (
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-[38px] w-[100px] dg-skeleton--control" />
                  <Skeleton className="h-[38px] w-[100px] dg-skeleton--control" />
                  <Skeleton className="h-[38px] w-[103px] dg-skeleton--control" />
                </div>
              ) : null}
            </div>
            {/* Stands in for the folded bulk-action bar, which still takes its gap. */}
            <div aria-hidden className="max-h-0 overflow-hidden" />

            <div className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)] bg-[var(--dg-color-surface)]">
              <div className="flex h-10 items-center gap-6 border-b border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg)] px-6">
                {["w-10", "w-16", "w-20", "w-14", "w-24", "w-12"].map((width, index) => (
                  <Skeleton key={index} className={cn("h-3", width)} />
                ))}
              </div>
              {DIRECTORY_ROW_WIDTHS.map((width, row) => (
                <div
                  key={row}
                  className="flex h-16 items-center gap-6 border-b border-[var(--dg-color-border-light)] px-6 last:border-b-0"
                >
                  <Skeleton className="h-3.5 w-12 shrink-0" />
                  <span className="flex w-56 shrink-0 items-center gap-2.5">
                    <Skeleton className="h-8 w-8 shrink-0 dg-skeleton--round" />
                    <Skeleton className={cn("h-3.5", width)} />
                  </span>
                  <Skeleton className="hidden h-3 w-16 shrink-0 sm:block" />
                  <Skeleton className="hidden h-5 w-24 shrink-0 dg-skeleton--round md:block" />
                  <Skeleton className="hidden h-3 w-44 shrink-0 lg:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The staff page's month grid: a title, the day names and five weeks of empty days. */
export function MonthCalendarSkeleton({ label }: { label: string }) {
  return (
    <section className="dg-card" aria-busy="true" aria-label={label}>
      <div className="dg-card-header">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="dg-card-body dg-no-scrollbar overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 gap-1.5 pb-2">
            {DAY_LABELS.map((day) => (
              <div
                key={day}
                className="text-center text-[13px] font-semibold text-[var(--dg-color-text-secondary)]"
              >
                {day}
              </div>
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((week) => (
            <div key={week} className="grid grid-cols-7 gap-1.5 pb-1.5">
              {DAY_LABELS.map((day) => (
                <div
                  key={day}
                  className="flex min-h-[92px] flex-col gap-1 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)] bg-[var(--dg-color-surface)] p-1.5"
                >
                  <Skeleton className="h-6 w-6 dg-skeleton--round" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
