"use client";
import { ChevronLeft, History } from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  parseLocalDateKey,
  summarizeCoverageMatrixRows,
  type CoverageMatrix,
  type CoverageMatrixCell,
} from "@dubgrid/schedule-core";
import { useSlideoverClose } from "@/hooks/useSlideoverClose";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import { Button } from "@/components/Button";
import type { FocusArea } from "@/types";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { SpanTabs } from "@/components/ui/span-tabs";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { useMediaQuery, MOBILE } from "@/hooks";
import {
  CoverageMatrixGrid,
  type CoverageCellRef,
} from "@/components/coverage-check/CoverageMatrixGrid";
import {
  CoverageCellDetail,
  type CoverageCellFill,
} from "@/components/coverage-check/CoverageCellDetail";
import {
  comparisonSentence,
  coverageCheckSubtitle,
  type CoverageCheckView,
} from "@/components/coverage-check/coverage-check-text";

interface CoveragePanelProps {
  /** Null in Month view, which computes no coverage. */
  matrix: CoverageMatrix | null;
  publishedDateKeys: ReadonlySet<string>;
  focusAreas: FocusArea[];
  activeFocusArea: number | null;
  publishedWindowState?: PublishedWindowState;
  /** Editors see the draft beside the published schedule; everyone else sees published values. */
  canEditShifts: boolean;
  hasRequirements: boolean;
  todayKey: string;
  getCellFill: (focusAreaId: number, cell: CoverageMatrixCell) => CoverageCellFill;
  onFillSpot: (focusAreaId: number, cell: CoverageMatrixCell) => void;
  onShowInGrid: (focusAreaId: number, dateKey: string) => void;
  onClose: () => void;
}

const VIEW_ITEMS: { value: CoverageCheckView; label: string }[] = [
  { value: "all", label: "Whole draft" },
  { value: "changes", label: "Changes since publish" },
];

function Legend({
  view,
  hasPast,
  hasUnpublished,
}: {
  view: CoverageCheckView;
  hasPast: boolean;
  hasUnpublished: boolean;
}) {
  return (
    <div className="dg-cc-legend" aria-label="Legend">
      <span className="dg-cc-legend-item">
        <span className="dg-cc-swatch dg-cc-cell--short" />
        Short
      </span>
      <span className="dg-cc-legend-item">
        <span className="dg-cc-swatch dg-cc-cell--over" />
        Over
      </span>
      <span className="dg-cc-legend-item">
        <span className="dg-cc-swatch dg-cc-swatch--staffed" />
        Staffed
      </span>
      {view === "changes" && (
        <>
          <span className="dg-cc-legend-item">
            <span className="dg-cc-swatch dg-cc-cell--opened" />
            Opened by this draft
          </span>
          <span className="dg-cc-legend-item">
            <span className="dg-cc-swatch dg-cc-cell--closed" />
            Closed by this draft
          </span>
          <span className="dg-cc-legend-item">
            <span className="dg-cc-swatch dg-cc-cell--changed" />
            Other change
          </span>
        </>
      )}
      {hasPast && (
        <span className="dg-cc-legend-item">
          <span className="dg-cc-swatch dg-cc-swatch--past" />
          Already started, not counted
        </span>
      )}
      {hasUnpublished && (
        <span className="dg-cc-legend-item">
          <b className="dg-cc-legend-date dg-tabular-nums">12</b>
          Dashed date: not published yet
        </span>
      )}
    </div>
  );
}

export default function CoveragePanel({
  matrix,
  publishedDateKeys,
  focusAreas,
  activeFocusArea,
  publishedWindowState = "published",
  canEditShifts,
  hasRequirements,
  todayKey,
  getCellFill,
  onFillSpot,
  onShowInGrid,
  onClose,
}: CoveragePanelProps) {
  const isMobile = useMediaQuery(MOBILE);
  const { closing, close } = useSlideoverClose(onClose);
  const isUnpublished = publishedWindowState === "unpublished";
  const isPartial = publishedWindowState === "partial";
  const [filterFocusArea, setFilterFocusArea] = useState<number | "all">(activeFocusArea ?? "all");
  const [prevActiveFocusArea, setPrevActiveFocusArea] = useState(activeFocusArea);
  if (activeFocusArea !== prevActiveFocusArea) {
    setPrevActiveFocusArea(activeFocusArea);
    setFilterFocusArea(activeFocusArea ?? "all");
  }
  const [view, setView] = useState<CoverageCheckView>("all");
  const [selected, setSelected] = useState<CoverageCellRef | null>(null);

  const dates = useMemo(() => matrix?.dateKeys.map(parseLocalDateKey) ?? [], [matrix]);
  const rows = useMemo(
    () =>
      (matrix?.rows ?? []).filter(
        (row) => filterFocusArea === "all" || row.focusAreaId === filterFocusArea,
      ),
    [matrix, filterFocusArea],
  );
  const totals = useMemo(
    () => summarizeCoverageMatrixRows(rows, matrix?.dateKeys ?? []),
    [rows, matrix],
  );
  const selection = useMemo(() => {
    if (!selected || !matrix) return null;
    const row = rows.find((candidate) => candidate.rowKey === selected.rowKey);
    const index = matrix.dateKeys.indexOf(selected.dateKey);
    const cell = row && index >= 0 ? row.cells[index] : null;
    return row && cell ? { row, cell, date: dates[index] } : null;
  }, [selected, matrix, rows, dates]);
  const detailRef = useRef<HTMLDivElement>(null);
  // Keyed on the pick, not the cell, so a live update never scrolls the panel.
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const hasPast = rows.some((row) => row.cells.some((cell) => cell?.past));
  const areaName =
    filterFocusArea === "all"
      ? null
      : (focusAreas.find((area) => area.id === filterFocusArea)?.name ?? null);

  // Staff who cannot edit only ever see published dates, so their window is
  // never compared and an unpublished window has nothing to show them.
  const hidesForViewer = !canEditShifts && isUnpublished;
  const comparable = canEditShifts && !isUnpublished && matrix !== null;
  const activeView: CoverageCheckView = comparable ? view : "all";
  const showsMatrix = matrix !== null && hasRequirements && !hidesForViewer;

  const subtitle = !matrix
    ? "Checked in 1 Week and 2 Weeks"
    : !hasRequirements
      ? "No coverage requirements"
      : hidesForViewer
        ? "Not published yet"
        : coverageCheckSubtitle({
            totals,
            publishedOnly: !canEditShifts && isPartial,
            areaName,
          });

  return createPortal(
    <>
      <div className={`dg-panel-overlay${closing ? " closing" : ""}`} onClick={close} />
      <div
        className={`dg-panel${showsMatrix ? " dg-panel--cols-2" : ""}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Coverage Check"
      >
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--dg-color-surface)",
          }}
        >
          {isMobile && (
            <Button
              onClick={close}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: "var(--dg-radius-md)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} color="var(--dg-color-text-primary)" />
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Coverage Check
            </div>
            <div
              className="dg-tabular-nums"
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          </div>
          {!isMobile && <CloseButton size="md" onClick={close} aria-label="Close Coverage Check" />}
        </div>

        {showsMatrix && (
          <div className="flex shrink-0 flex-col gap-2.5 border-b border-[var(--dg-color-border)] px-4 py-3 md:px-5">
            {comparable && (
              <div className="dg-cc-note dg-tabular-nums">
                <History
                  size={16}
                  aria-hidden
                  className="mt-px shrink-0 text-[var(--dg-color-brand)]"
                />
                <span>{comparisonSentence(totals, isPartial)}</span>
              </div>
            )}
            {canEditShifts && isUnpublished && (
              <div className="dg-cc-note">
                Nothing in this period is published yet, so there is nothing to compare. The counts
                are the draft&apos;s.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {comparable && (
                <SpanTabs
                  aria-label="Coverage Check view"
                  items={VIEW_ITEMS}
                  value={activeView}
                  onChange={setView}
                />
              )}
              <CustomSelect
                style={{ flex: "1 1 180px" }}
                value={filterFocusArea === "all" ? "all" : String(filterFocusArea)}
                options={[
                  { value: "all", label: "All Focus Areas" },
                  ...focusAreas.map((fa) => ({ value: String(fa.id), label: fa.name })),
                ]}
                onChange={(val) => setFilterFocusArea(val === "all" ? "all" : Number(val))}
                fontSize="var(--dg-fs-caption)"
              />
            </div>
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "16px" : "16px 20px",
          }}
        >
          {!matrix ? (
            <EmptyState
              size="compact"
              style={{ minHeight: 260 }}
              title="Switch to 1 Week or 2 Weeks"
              description="Coverage is checked in 1 Week and 2 Weeks."
            />
          ) : !hasRequirements ? (
            <EmptyState
              size="compact"
              style={{ minHeight: 260 }}
              title="No coverage requirements"
              description="Coverage Check compares the schedule with how many people each shift needs. Set those numbers in Settings > Coverage."
            />
          ) : hidesForViewer ? (
            <EmptyState
              size="compact"
              style={{ minHeight: 260 }}
              title="Not published yet"
              description="Coverage details will appear after this period is published for the first time."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {!canEditShifts && isPartial && (
                <div className="dg-cc-note">Showing published dates only.</div>
              )}
              {rows.length === 0 ? (
                <EmptyState
                  size="compact"
                  title="No coverage requirements here"
                  description={
                    areaName
                      ? `${areaName} has no coverage requirements for these dates.`
                      : "No requirement applies to these dates."
                  }
                />
              ) : (
                <>
                  <CoverageMatrixGrid
                    dates={dates}
                    dateKeys={matrix.dateKeys}
                    rows={rows}
                    staffShortByDate={totals.staffShortByDate}
                    publishedDateKeys={publishedDateKeys}
                    showUnpublishedMarks={canEditShifts && isPartial}
                    view={activeView}
                    todayKey={todayKey}
                    selected={selected}
                    onSelect={(cell) =>
                      setSelected((current) =>
                        current?.rowKey === cell.rowKey && current.dateKey === cell.dateKey
                          ? null
                          : cell,
                      )
                    }
                  />
                  <Legend
                    view={activeView}
                    hasPast={hasPast}
                    hasUnpublished={canEditShifts && isPartial}
                  />
                  {selection && (
                    <div ref={detailRef}>
                      <CoverageCellDetail
                        row={selection.row}
                        cell={selection.cell}
                        date={selection.date}
                        canEditShifts={canEditShifts}
                        fill={getCellFill(selection.row.focusAreaId, selection.cell)}
                        onFillSpot={() => onFillSpot(selection.row.focusAreaId, selection.cell)}
                        onShowInGrid={() =>
                          onShowInGrid(selection.row.focusAreaId, selection.cell.dateKey)
                        }
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <ScrollOverflowCue />
      </div>
    </>,
    document.body,
  );
}
