"use client";

import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import { addDays, formatDate } from "@/lib/utils";
import { FocusArea } from "@/types";
import { useMediaQuery, MOBILE, TABLET } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";
import ScrollableTabs from "@/components/ScrollableTabs";

const SPAN_OPTIONS = [
  { value: "1" as const, label: "1 Week" },
  { value: "2" as const, label: "2 Weeks" },
  { value: "month" as const, label: "Month" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ToolbarProps {
  weekStart: Date;
  spanWeeks: 1 | 2 | "month";
  activeFocusArea: number | null;
  staffSearch: string;
  focusAreas: FocusArea[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSpanChange: (n: 1 | 2 | "month") => void;
  onFocusAreaChange: (id: number | null) => void;
  onStaffSearchChange: (q: string) => void;
  canEditShifts?: boolean;
  onApplyRecurring?: () => void;
  isApplyingRecurring?: boolean;
  onImportPrevious?: () => void;
  isImportingPrevious?: boolean;
  onPrintOpen?: () => void;
  presenceSlot?: React.ReactNode;
  showAudit?: boolean;
  onAuditToggle?: () => void;
  /** Badge count for shift requests (swaps directed at me + pending approvals for admins). */
  requestsBadgeCount?: number;
  /** Toggle the shift requests board panel. */
  onRequestsToggle?: () => void;
  /** Badge count for coverage gaps. */
  coverageGapCount?: number;
  /** Toggle the coverage panel. */
  onCoverageToggle?: () => void;
  /** Hide the 2-week option (auto-downgraded on narrow screens). */
  hideTwoWeek?: boolean;
}

/* ── Toggle Switch ── */
function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: on ? "var(--color-success)" : "var(--color-border)",
        position: "relative",
        transition: "background 150ms ease",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "var(--color-surface)",
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          transition: "left 150ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

/* ── Tools Dropdown Menu ── */
function ToolsMenu({
  triggerRef,
  onClose,
  showAudit,
  onAuditToggle,
  onPrintOpen,
  canEditShifts,
  onApplyRecurring,
  isApplyingRecurring,
  onImportPrevious,
  isImportingPrevious,
  requestsBadgeCount,
  onRequestsToggle,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  showAudit?: boolean;
  onAuditToggle?: () => void;
  onPrintOpen?: () => void;
  canEditShifts?: boolean;
  onApplyRecurring?: () => void;
  isApplyingRecurring?: boolean;
  onImportPrevious?: () => void;
  isImportingPrevious?: boolean;
  requestsBadgeCount?: number;
  onRequestsToggle?: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: rect.right,
    });
  }, [triggerRef]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, triggerRef]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="dg-menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translateX(-100%)",
        zIndex: 9999,
        minWidth: 200,
      }}
    >
      {/* Authors toggle */}
      {onAuditToggle && (
        <button
          role="menuitem"
          className="dg-menu-item"
          onClick={onAuditToggle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span style={{ flex: 1 }}>Authors</span>
          <ToggleSwitch on={!!showAudit} />
        </button>
      )}

      {/* Requests */}
      {onRequestsToggle && (
        <button
          role="menuitem"
          className="dg-menu-item"
          onClick={() => { onRequestsToggle(); onClose(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <span style={{ flex: 1 }}>Requests</span>
          {(requestsBadgeCount ?? 0) > 0 && (
            <span className="dg-notification-badge">
              {(requestsBadgeCount ?? 0) > 99 ? "99+" : requestsBadgeCount}
            </span>
          )}
        </button>
      )}

      {/* Print */}
      {onPrintOpen && (
        <button
          role="menuitem"
          className="dg-menu-item"
          onClick={() => { onPrintOpen(); onClose(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print
        </button>
      )}

      {/* Auto Fill Shifts */}
      {canEditShifts && onApplyRecurring && (
        <button
          role="menuitem"
          className="dg-menu-item"
          disabled={isApplyingRecurring}
          onClick={() => { onApplyRecurring(); onClose(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
          </svg>
          {isApplyingRecurring ? "Filling..." : "Auto Fill Shifts"}
        </button>
      )}

      {/* Import Previous Schedule */}
      {canEditShifts && onImportPrevious && (
        <button
          role="menuitem"
          className="dg-menu-item"
          disabled={isImportingPrevious}
          onClick={() => { onImportPrevious(); onClose(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          {isImportingPrevious ? "Importing..." : "Import Previous Schedule"}
        </button>
      )}
    </div>,
    document.body,
  );
}

export default function Toolbar({
  weekStart,
  spanWeeks,
  activeFocusArea,
  staffSearch,
  focusAreas,
  onPrev,
  onNext,
  onToday,
  onSpanChange,
  onFocusAreaChange,
  onStaffSearchChange,
  canEditShifts,
  onApplyRecurring,
  isApplyingRecurring,
  onImportPrevious,
  isImportingPrevious,
  onPrintOpen,
  presenceSlot,
  showAudit,
  onAuditToggle,
  requestsBadgeCount = 0,
  onRequestsToggle,
  coverageGapCount = 0,
  onCoverageToggle,
  hideTwoWeek,
}: ToolbarProps) {
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);

  const spanOptions = (hideTwoWeek || isMobile)
    ? SPAN_OPTIONS.filter((o) => o.value !== "2")
    : SPAN_OPTIONS;

  const weekLabel = useMemo(() => {
    if (spanWeeks === "month") {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return spanWeeks === 2
      ? `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 13))}`
      : `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`;
  }, [weekStart, spanWeeks]);

  const focusAreaOptions: { id: number | null; name: string }[] = [
    { id: null, name: "All" },
    ...focusAreas.map((fa) => ({ id: fa.id, name: fa.name })),
  ];

  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const toggleTools = useCallback(() => setToolsOpen((p) => !p), []);
  const closeTools = useCallback(() => setToolsOpen(false), []);

  /* ── Mobile Toolbar ─────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        {/* Row 1: Time navigation — where in time */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={onPrev}
            className="dg-btn dg-btn-secondary"
            style={{
              width: 44,
              height: 44,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              flexShrink: 0,
            }}
            title="Previous period"
            aria-label="Previous period"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
              textAlign: "center",
              flex: 1,
              userSelect: "none",
            }}
          >
            {weekLabel}
          </span>
          <button
            onClick={onNext}
            className="dg-btn dg-btn-secondary"
            style={{
              width: 44,
              height: 44,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              flexShrink: 0,
            }}
            title="Next period"
            aria-label="Next period"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            onClick={onToday}
            className="dg-btn dg-btn-secondary"
            style={{
              height: 44,
              padding: "0 14px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              borderRadius: 10,
              flexShrink: 0,
            }}
          >
            Today
          </button>
        </div>

        {/* Row 2: View controls — how to view */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CustomSelect
            value={String(spanWeeks)}
            options={spanOptions}
            onChange={(val) => onSpanChange(val === "month" ? "month" : (Number(val) as 1 | 2))}
            fontSize="var(--dg-fs-caption)"
          />
          <div style={{ position: "relative", flex: 1 }}>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: "var(--color-text-faint)", pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Find staff…"
              value={staffSearch}
              onChange={(e) => onStaffSearchChange(e.target.value)}
              className="dg-input"
              style={{ paddingLeft: 30, width: "100%", borderRadius: 10 }}
            />
            {staffSearch && (
              <button
                onClick={() => onStaffSearchChange("")}
                className="dg-btn-ghost"
                style={{
                  position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                  padding: "2px 5px", fontSize: "var(--dg-fs-body-sm)", lineHeight: 1, borderRadius: 8,
                }}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button
            ref={toolsBtnRef}
            onClick={toggleTools}
            aria-expanded={toolsOpen}
            aria-haspopup="menu"
            className="dg-btn dg-btn-ghost"
            style={{
              border: toolsOpen ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
              borderRadius: 10,
              height: 44,
              padding: "0 12px",
              background: toolsOpen ? "rgba(46, 153, 48, 0.08)" : undefined,
              color: toolsOpen ? "var(--color-primary)" : undefined,
              flexShrink: 0,
              position: "relative",
            }}
            title="Tools"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            Tools
            {requestsBadgeCount > 0 && (
              <span className="dg-notification-badge dg-notification-badge--absolute">
                {requestsBadgeCount > 99 ? "99+" : requestsBadgeCount}
              </span>
            )}
          </button>
          {toolsOpen && (
            <ToolsMenu
              triggerRef={toolsBtnRef}
              onClose={closeTools}
              showAudit={showAudit}
              onAuditToggle={onAuditToggle}
              onPrintOpen={onPrintOpen}
              canEditShifts={canEditShifts}
              onApplyRecurring={onApplyRecurring}
              isApplyingRecurring={isApplyingRecurring}
              onImportPrevious={onImportPrevious}
              isImportingPrevious={isImportingPrevious}
              requestsBadgeCount={requestsBadgeCount}
              onRequestsToggle={onRequestsToggle}
            />
          )}
        </div>
      </div>
    );
  }

  /* ── Desktop / Tablet Toolbar ───────────────────────────── */
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
      {/* ── NAV ZONE: Time navigation + span (stays as one unit) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Chevrons + date label */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
              borderRadius: 10,
              flexShrink: 0,
            }}
            title="Previous period"
            aria-label="Previous period"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
              minWidth: 120,
              textAlign: "center",
              userSelect: "none",
            }}
          >
            {weekLabel}
          </span>
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
              borderRadius: 10,
              flexShrink: 0,
            }}
            title="Next period"
            aria-label="Next period"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
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
            borderRadius: 10,
          }}
        >
          Today
        </button>

        {/* Span selector */}
        <CustomSelect
          value={String(spanWeeks)}
          options={spanOptions}
          onChange={(val) => onSpanChange(val === "month" ? "month" : (Number(val) as 1 | 2))}
        />
      </div>

      {/* ── FILTER ZONE: Focus areas + search (wraps to row 2 on tablet) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...(isTablet ? { order: 3, flexBasis: "100%" } : {}),
        }}
      >
        {/* Focus area filter */}
        {focusAreaOptions.length > 1 && (
          <ScrollableTabs
            className="dg-span-tabs dg-span-tabs--light"
            style={{ flex: 1, minWidth: 0 }}
          >
            {focusAreaOptions.map((w, i) => {
              const isActive = activeFocusArea === w.id;
              const prevActive = i > 0 && activeFocusArea === focusAreaOptions[i - 1].id;
              const showDivider = i > 0 && !isActive && !prevActive;
              return (
                <Fragment key={w.id ?? "all"}>
                  {i > 0 && (
                    <div style={{ width: 1, height: 16, background: showDivider ? "var(--color-border)" : "transparent", flexShrink: 0, alignSelf: "center" }} />
                  )}
                  <button
                    onClick={() => onFocusAreaChange(w.id)}
                    className={`dg-span-tab${isActive ? " active" : ""}`}
                  >
                    {w.name}
                  </button>
                </Fragment>
              );
            })}
          </ScrollableTabs>
        )}

        {/* Staff search */}
        <div style={{ position: "relative" }}>
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--color-text-faint)", pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Find staff…"
            value={staffSearch}
            onChange={(e) => onStaffSearchChange(e.target.value)}
            className="dg-input"
            style={{ paddingLeft: 30, width: isTablet ? 180 : 160, borderRadius: 10 }}
          />
          {staffSearch && (
            <button
              onClick={() => onStaffSearchChange("")}
              className="dg-btn-ghost"
              style={{
                position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                padding: "2px 5px", fontSize: "var(--dg-fs-body-sm)", lineHeight: 1, borderRadius: 8,
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT ZONE: Presence + Coverage + Tools ── */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {presenceSlot}

        {/* Coverage button */}
        {onCoverageToggle && (
          <button
            onClick={onCoverageToggle}
            className="dg-btn dg-btn-ghost"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              height: "var(--dg-toolbar-h)",
              padding: "0 12px",
              position: "relative",
              color: coverageGapCount > 0 ? "var(--color-danger)" : undefined,
            }}
            title="Coverage"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Coverage
            {coverageGapCount > 0 && (
              <span className="dg-notification-badge dg-notification-badge--absolute">
                {coverageGapCount > 99 ? "99+" : coverageGapCount}
              </span>
            )}
          </button>
        )}

        {/* Tools dropdown */}
        <button
          ref={toolsBtnRef}
          onClick={toggleTools}
          aria-expanded={toolsOpen}
          aria-haspopup="menu"
          className="dg-btn dg-btn-ghost"
          style={{
            border: toolsOpen ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
            borderRadius: 10,
            height: "var(--dg-toolbar-h)",
            padding: "0 12px",
            background: toolsOpen ? "rgba(46, 153, 48, 0.08)" : undefined,
            color: toolsOpen ? "var(--color-primary)" : undefined,
            position: "relative",
          }}
          title="Tools"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          Tools
          {requestsBadgeCount > 0 && (
            <span className="dg-notification-badge dg-notification-badge--absolute">
              {requestsBadgeCount > 99 ? "99+" : requestsBadgeCount}
            </span>
          )}
        </button>

        {toolsOpen && (
          <ToolsMenu
            triggerRef={toolsBtnRef}
            onClose={closeTools}
            showAudit={showAudit}
            onAuditToggle={onAuditToggle}
            onPrintOpen={onPrintOpen}
            canEditShifts={canEditShifts}
            onApplyRecurring={onApplyRecurring}
            isApplyingRecurring={isApplyingRecurring}
            onImportPrevious={onImportPrevious}
            isImportingPrevious={isImportingPrevious}
            requestsBadgeCount={requestsBadgeCount}
            onRequestsToggle={onRequestsToggle}
          />
        )}
      </div>
    </div>
  );
}
