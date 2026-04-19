import { Fragment } from "react";
import type { ViewMode } from "./DashboardView";
import { useMediaQuery, MOBILE } from "@/hooks";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "2weeks", label: "2 Weeks" },
];

function formatDateRange(start: Date, end: Date, mode: ViewMode): string {
  const sMonth = MONTHS[start.getMonth()];
  const sDay = start.getDate();
  const year = start.getFullYear();

  if (mode === "day") {
    return `${DAYS[start.getDay()]}, ${sMonth} ${sDay}, ${year}`;
  }

  const eMonth = MONTHS[end.getMonth()];
  const eDay = end.getDate();
  const eYear = end.getFullYear();

  if (mode === "week") {
    if (sMonth === eMonth) {
      return `${sMonth} ${sDay} \u2013 ${eDay}, ${year}`;
    }
    return `${sMonth} ${sDay} \u2013 ${eMonth} ${eDay}, ${eYear}`;
  }

  // 2weeks
  if (sMonth === eMonth) {
    return `${sMonth} ${sDay} \u2013 ${eDay}, ${year}`;
  }
  if (year === eYear) {
    return `${sMonth} ${sDay} \u2013 ${eMonth} ${eDay}, ${year}`;
  }
  return `${sMonth} ${sDay}, ${year} \u2013 ${eMonth} ${eDay}, ${eYear}`;
}

interface DashboardHeaderProps {
  periodStart: Date;
  periodEnd: Date;
  viewMode: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export default function DashboardHeader({
  periodStart,
  periodEnd,
  viewMode,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
}: DashboardHeaderProps) {
  const isMobile = useMediaQuery(MOBILE);
  const todayLabel =
    viewMode === "day"
      ? "Today"
      : viewMode === "week"
        ? "This week"
        : "Current period";

  const dateLabel = formatDateRange(periodStart, periodEnd, viewMode);

  /* ── Mobile ─────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: 8,
        }}
      >
        {/* Row 1: Period navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Hint content={hint("Go to previous period")} side="bottom">
            <button
              onClick={onPrev}
              className="dg-btn dg-btn-secondary"
              style={{
                width: "var(--dg-toolbar-h)",
                height: "var(--dg-toolbar-h)",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--dg-btn-radius)",
                flexShrink: 0,
              }}
              aria-label="Go to previous period"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </Hint>
          <div style={{ flex: 1, textAlign: "center", userSelect: "none" }}>
            <span
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {dateLabel}
            </span>
          </div>
          <Hint content={hint("Go to next period")} side="bottom">
            <button
              onClick={onNext}
              className="dg-btn dg-btn-secondary"
              style={{
                width: "var(--dg-toolbar-h)",
                height: "var(--dg-toolbar-h)",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--dg-btn-radius)",
                flexShrink: 0,
              }}
              aria-label="Go to next period"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </Hint>
          <button
            onClick={onToday}
            className="dg-btn dg-btn-secondary"
            style={{
              height: "var(--dg-toolbar-h)",
              padding: "0 14px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              borderRadius: "var(--dg-btn-radius)",
              flexShrink: 0,
            }}
          >
            {todayLabel}
          </button>
        </div>

        {/* Row 2: View mode tabs */}
        <div
          className="dg-span-tabs dg-span-tabs--light"
          style={{ alignSelf: "flex-start" }}
        >
          {VIEW_MODES.map((m, i) => {
            const isActive = viewMode === m.value;
            const prevActive = i > 0 && viewMode === VIEW_MODES[i - 1].value;
            const showDivider = i > 0 && !isActive && !prevActive;
            return (
              <Fragment key={m.value}>
                {i > 0 && (
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: showDivider
                        ? "var(--color-border)"
                        : "transparent",
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />
                )}
                <button
                  onClick={() => onViewModeChange(m.value)}
                  className={`dg-span-tab${isActive ? " active" : ""}`}
                >
                  {m.label}
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Desktop / Tablet ───────────────────────────────────── */
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        rowGap: 8,
        flexWrap: "wrap",
        paddingBottom: 12,
      }}
    >
      {/* LEFT ZONE: time navigation + mode selector */}
      <div
        data-tour="dashboard-period-nav"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Hint content={hint("Go to previous period")} side="bottom">
            <button
              onClick={onPrev}
              className="dg-btn dg-btn-secondary"
              style={{
                width: "var(--dg-toolbar-h)",
                height: "var(--dg-toolbar-h)",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--dg-btn-radius)",
                flexShrink: 0,
              }}
              aria-label="Go to previous period"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </Hint>
          <div
            style={{
              textAlign: "center",
              userSelect: "none",
              minWidth: 120,
            }}
          >
            <span
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {dateLabel}
            </span>
          </div>
          <Hint content={hint("Go to next period")} side="bottom">
            <button
              onClick={onNext}
              className="dg-btn dg-btn-secondary"
              style={{
                width: "var(--dg-toolbar-h)",
                height: "var(--dg-toolbar-h)",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--dg-btn-radius)",
                flexShrink: 0,
              }}
              aria-label="Go to next period"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </Hint>
        </div>

        {/* Today button */}
        <button
          onClick={onToday}
          className="dg-btn dg-btn-secondary"
          style={{
            height: "var(--dg-toolbar-h)",
            padding: "0 14px",
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 600,
            borderRadius: "var(--dg-btn-radius)",
          }}
        >
          {todayLabel}
        </button>

        {/* View mode selector */}
        <div
          data-tour="dashboard-view-mode"
          className="dg-span-tabs dg-span-tabs--light"
        >
          {VIEW_MODES.map((m, i) => {
            const isActive = viewMode === m.value;
            const prevActive = i > 0 && viewMode === VIEW_MODES[i - 1].value;
            const showDivider = i > 0 && !isActive && !prevActive;
            return (
              <Fragment key={m.value}>
                {i > 0 && (
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: showDivider
                        ? "var(--color-border)"
                        : "transparent",
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />
                )}
                <button
                  onClick={() => onViewModeChange(m.value)}
                  className={`dg-span-tab${isActive ? " active" : ""}`}
                >
                  {m.label}
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>

    </div>
  );
}
