"use client";

import { useState, Fragment } from "react";
import { ShiftCode, FocusArea } from "@/types";
import { isEmployeeQualified } from "@/lib/schedule-logic";
import ScrollableTabs from "@/components/ScrollableTabs";

interface ShiftPickerProps {
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  currentShiftCodeIds?: number[];
  onSelect: (label: string, shiftCodeIds: number[]) => void;
  empFocusAreaIds?: number[];
  empCertificationId?: number | null;
  initialTab?: number | null;
  /** If true, allows multiple shifts to be selected. */
  multiSelect?: boolean;
  /** If true, closes the picker immediately on select (usually for single-select). */
  closeOnSelect?: boolean;
  onClose?: () => void;
}

function parseTo12h(time24: string | null | undefined): { hour: string; minute: string; period: "AM" | "PM" } {
  if (!time24) return { hour: "", minute: "00", period: "AM" };
  const [h, m] = time24.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: String(m).padStart(2, "0"), period };
}

function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const { hour, minute, period } = parseTo12h(time24);
  return `${hour}:${minute} ${period}`;
}

export default function ShiftPicker({
  shiftCodes,
  focusAreas,
  currentShiftCodeIds = [],
  onSelect,
  empFocusAreaIds = [],
  empCertificationId = null,
  initialTab = null,
  multiSelect = false,
  closeOnSelect = true,
  onClose,
}: ShiftPickerProps) {
  const [pickerTab, setPickerTab] = useState<number>(() => {
    if (initialTab != null) return initialTab;
    if (currentShiftCodeIds.length > 0) {
      const firstCode = shiftCodes.find((s) => s.id === currentShiftCodeIds[0]);
      if (firstCode?.focusAreaId != null) return firstCode.focusAreaId;
    }
    return empFocusAreaIds[0] ?? 0;
  });

  function isQualified(s: ShiftCode) {
    return isEmployeeQualified(
      { certificationId: empCertificationId, focusAreaIds: empFocusAreaIds },
      s,
    );
  }

  function getShiftsForFocusArea(faId: number): ShiftCode[] {
    return shiftCodes.filter(
      (st) => !st.isGeneral && st.focusAreaId === faId && isQualified(st),
    );
  }

  const allPickerAreas = [
    ...focusAreas.filter(
      (fa) =>
        empFocusAreaIds.includes(fa.id) &&
        shiftCodes.some((st) => !st.isGeneral && st.focusAreaId === fa.id && isQualified(st)),
    ),
    ...focusAreas.filter(
      (fa) =>
        !empFocusAreaIds.includes(fa.id) &&
        shiftCodes.some((st) => !st.isGeneral && st.focusAreaId === fa.id && isQualified(st)),
    ),
  ];

  const generalNonOffShifts = shiftCodes.filter((st) => st.isGeneral && !st.isOffDay && isQualified(st));
  const offDayShifts = shiftCodes.filter((st) => st.isOffDay && isQualified(st));

  function renderShiftButton(s: ShiftCode) {
    const isActive = currentShiftCodeIds.includes(s.id);

    const handleToggle = () => {
      let newIds: number[];
      if (multiSelect) {
        if (isActive) {
          newIds = currentShiftCodeIds.filter((id) => id !== s.id);
        } else if (currentShiftCodeIds.length >= 2) {
          return; // Max 2 shifts per cell
        } else {
          newIds = [...currentShiftCodeIds, s.id];
        }
      } else {
        newIds = [s.id];
      }

      const newLabels = newIds
        .map((id) => shiftCodes.find((sc) => sc.id === id)?.label)
        .filter((l): l is string => l != null && l !== "OFF");
      
      const newShift = newLabels.length > 0 ? newLabels.join("/") : "OFF";
      onSelect(newShift, newIds);
      
      if (closeOnSelect && !multiSelect) {
        onClose?.();
      }
    };

    return (
      <button
        key={s.id}
        onClick={handleToggle}
        aria-pressed={isActive}
        aria-label={`${s.label} - ${s.name}`}
        style={{
          background: isActive ? s.color : `${s.color}40`,
          border: `1.5px solid ${isActive ? s.border : s.text}`,
          borderRadius: 8,
          padding: "6px 8px 4px",
          cursor: "pointer",
          textAlign: "left",
          transition: "border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, transform 150ms ease",
          position: "relative",
          boxShadow: isActive ? "inset 0 1px 3px rgba(0,0,0,0.1)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = `${s.color}70`;
            e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = `${s.color}40`;
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
      >
        {isActive && (
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: s.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        <div
          style={{
            fontWeight: 800,
            fontSize: "var(--dg-fs-caption)",
            color: s.text,
            opacity: isActive ? 1 : 0.75,
            transition: "opacity 150ms ease",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {s.label}
          {s.isOffDay && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="10" y1="14" x2="14" y2="18" />
              <line x1="14" y1="14" x2="10" y2="18" />
            </svg>
          )}
        </div>

        <div
          style={{
            fontSize: "var(--dg-fs-micro)",
            color: "var(--color-text-subtle)",
            marginTop: 1,
          }}
        >
          {s.name}
        </div>

      </button>
    );
  }

  const activeArea = allPickerAreas.find((fa) => fa.id === pickerTab);
  const areaName = activeArea?.name ?? allPickerAreas[0]?.name ?? "";
  const areaShifts = getShiftsForFocusArea(pickerTab);

  const sectionHeading: React.CSSProperties = {
    marginBottom: 10,
    fontSize: "var(--dg-fs-footnote)",
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const countPill: React.CSSProperties = {
    fontSize: "var(--dg-fs-badge)",
    fontWeight: 600,
    color: "var(--color-text-faint)",
    background: "var(--color-bg-secondary)",
    padding: "1px 6px",
    borderRadius: 10,
  };

  const headingLine: React.CSSProperties = {
    flex: 1,
    height: 1,
    background: "var(--color-border-light)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tabs — stretch to fill when few, horizontal scroll when many */}
      {allPickerAreas.length > 1 && (
        <ScrollableTabs className="dg-span-tabs dg-span-tabs--light">
          {allPickerAreas.map((fa, i) => {
            const isActive = pickerTab === fa.id;
            const prevActive = i > 0 && pickerTab === allPickerAreas[i - 1].id;
            const showDivider = i > 0 && !isActive && !prevActive;
            return (
              <Fragment key={fa.id}>
                {i > 0 && (
                  <div style={{ width: 1, height: 16, background: showDivider ? "var(--color-border)" : "transparent", flexShrink: 0, alignSelf: "center" }} />
                )}
                <button
                  onClick={() => setPickerTab(fa.id)}
                  className={`dg-span-tab${isActive ? " active" : ""}`}
                  style={{ flex: "1 0 auto", textAlign: "center", whiteSpace: "nowrap" }}
                >
                  {fa.name}
                </button>
              </Fragment>
            );
          })}
        </ScrollableTabs>
      )}

      {/* Shifts */}
      <div>
        {areaShifts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {allPickerAreas.length <= 1 && (
              <div style={sectionHeading}>
                {areaName}
                <span style={countPill}>{areaShifts.length}</span>
                <div style={headingLine} />
              </div>
            )}
            <div role="group" aria-label="Shift options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {areaShifts.map((s) => renderShiftButton(s))}
            </div>
          </div>
        )}

        {generalNonOffShifts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionHeading}>
              General
              <span style={countPill}>{generalNonOffShifts.length}</span>
              <div style={headingLine} />
            </div>
            <div role="group" aria-label="General shift options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {generalNonOffShifts.map((s) => renderShiftButton(s))}
            </div>
          </div>
        )}

        {offDayShifts.length > 0 && (
          <div>
            <div style={sectionHeading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Off Days
              <span style={countPill}>{offDayShifts.length}</span>
              <div style={headingLine} />
            </div>
            <div role="group" aria-label="Off day shift options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {offDayShifts.map((s) => renderShiftButton(s))}
            </div>
          </div>
        )}

        {areaShifts.length === 0 && generalNonOffShifts.length === 0 && offDayShifts.length === 0 && (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              color: "var(--color-text-subtle)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            No shifts available.
          </div>
        )}
      </div>
    </div>
  );
}
