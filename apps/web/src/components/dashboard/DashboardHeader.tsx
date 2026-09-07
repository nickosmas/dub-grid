import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type CSSProperties } from "react";
import type { ViewMode } from "./DashboardView";
import { useMediaQuery, MOBILE } from "@/hooks";
import { Button } from "@/components/Button";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  showViewModeTabs?: boolean;
  availableViewModes?: ViewMode[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export default function DashboardHeader({
  periodStart,
  periodEnd,
  viewMode,
  showViewModeTabs = true,
  availableViewModes,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
}: DashboardHeaderProps) {
  const viewModeOptions = availableViewModes
    ? VIEW_MODES.filter((mode) => availableViewModes.includes(mode.value))
    : VIEW_MODES;
  const isMobile = useMediaQuery(MOBILE);
  const todayLabel =
    viewMode === "day" ? "Today" : viewMode === "week" ? "This week" : "Current period";

  const dateLabel = formatDateRange(periodStart, periodEnd, viewMode);

  /* ── Mobile ─────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div
        className="dg-toolbar-type"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: 8,
        }}
      >
        {/* Row 1: Period navigation */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "var(--dg-toolbar-h) minmax(0, 1fr) var(--dg-toolbar-h)",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Hint content={hint("Go to previous period")} side="bottom">
            <Button
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
              <ChevronLeft size={16} strokeWidth={2.5} />
            </Button>
          </Hint>
          <div style={{ minWidth: 0, textAlign: "center", userSelect: "none" }}>
            <span
              style={{
                display: "block",
                color: "var(--dg-color-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dateLabel}
            </span>
          </div>
          <Hint content={hint("Go to next period")} side="bottom">
            <Button
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
              <ChevronRight size={16} strokeWidth={2.5} />
            </Button>
          </Hint>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {showViewModeTabs ? (
            <ViewModeTabs
              modes={viewModeOptions}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              style={{
                alignSelf: "flex-start",
                maxWidth: "100%",
                minWidth: 0,
                overflowX: "auto",
                overflowY: "hidden",
              }}
            />
          ) : (
            <div />
          )}
          <Button
            onClick={onToday}
            className="dg-btn dg-btn-secondary"
            style={{
              height: "var(--dg-toolbar-h)",
              padding: "0 14px",
              borderRadius: "var(--dg-btn-radius)",
              flexShrink: 0,
            }}
          >
            {todayLabel}
          </Button>
        </div>
      </div>
    );
  }

  /* ── Desktop / Tablet ───────────────────────────────────── */
  return (
    <div
      className="dg-toolbar-type"
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
      {/* Wraps and may shrink: this layout also renders for a frame at phone
          widths, before the media query resolves, and a rigid row there pushes
          its own controls off the side of the screen. */}
      <div
        data-tour="dashboard-period-nav"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          rowGap: 8,
          flexWrap: "wrap",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <Hint content={hint("Go to previous period")} side="bottom">
            <Button
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
              <ChevronLeft size={14} strokeWidth={2.5} />
            </Button>
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
                color: "var(--dg-color-text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {dateLabel}
            </span>
          </div>
          <Hint content={hint("Go to next period")} side="bottom">
            <Button
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
              <ChevronRight size={14} strokeWidth={2.5} />
            </Button>
          </Hint>
        </div>

        {/* Today button */}
        <Button
          onClick={onToday}
          className="dg-btn dg-btn-secondary"
          style={{
            height: "var(--dg-toolbar-h)",
            padding: "0 14px",
            borderRadius: "var(--dg-btn-radius)",
          }}
        >
          {todayLabel}
        </Button>

        {showViewModeTabs ? (
          <ViewModeTabs
            modes={viewModeOptions}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        ) : null}
      </div>
    </div>
  );
}

function ViewModeTabs({
  modes,
  viewMode,
  onViewModeChange,
  style,
}: {
  modes: { value: ViewMode; label: string }[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  style?: CSSProperties;
}) {
  return (
    <div data-tour="dashboard-view-mode" className="dg-span-tabs dg-span-tabs--light" style={style}>
      {modes.map((m, i) => {
        const isActive = viewMode === m.value;
        const prevActive = i > 0 && viewMode === modes[i - 1].value;
        const showDivider = i > 0 && !isActive && !prevActive;
        return (
          <Fragment key={m.value}>
            {i > 0 && (
              <div
                style={{
                  width: 1,
                  height: 16,
                  background: showDivider ? "var(--dg-color-border)" : "transparent",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              />
            )}
            <Button
              onClick={() => onViewModeChange(m.value)}
              className={`dg-span-tab${isActive ? " active" : ""}`}
            >
              {m.label}
            </Button>
          </Fragment>
        );
      })}
    </div>
  );
}
