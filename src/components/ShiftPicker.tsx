"use client";

import { useState, Fragment } from "react";
import { Check } from "lucide-react";
import { ShiftCode, AbsenceType, FocusArea, ShiftDisplayMode } from "@/types";
import { isEmployeeQualified } from "@/lib/schedule-logic";
import ScrollableTabs from "@/components/ScrollableTabs";

interface ShiftPickerProps {
  shiftCodes: ShiftCode[];
  absenceTypes?: AbsenceType[];
  focusAreas: FocusArea[];
  currentShiftCodeIds?: number[];
  currentAbsenceTypeId?: number | null;
  onSelect: (label: string, shiftCodeIds: number[]) => void;
  onAbsenceSelect?: (absenceType: AbsenceType) => void;
  empFocusAreaIds?: number[];
  empCertificationId?: number | null;
  initialTab?: number | null;
  /** If true, allows multiple shifts to be selected. */
  multiSelect?: boolean;
  /** If true, closes the picker immediately on select (usually for single-select). */
  closeOnSelect?: boolean;
  onClose?: () => void;
  shiftDisplayMode?: ShiftDisplayMode;
}

export default function ShiftPicker({
  shiftCodes,
  absenceTypes = [],
  focusAreas,
  currentShiftCodeIds = [],
  currentAbsenceTypeId,
  onSelect,
  onAbsenceSelect,
  empFocusAreaIds = [],
  empCertificationId = null,
  initialTab = null,
  multiSelect = false,
  closeOnSelect = true,
  onClose,
  shiftDisplayMode = "code",
}: ShiftPickerProps) {
  const isNameMode = shiftDisplayMode === "name";
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

  const generalNonOffShifts = shiftCodes.filter((st) => st.isGeneral && isQualified(st));

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
        .map((id) => {
          const sc = shiftCodes.find((c) => c.id === id);
          return sc ? (isNameMode ? (sc.name || sc.label) : sc.label) : null;
        })
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
          padding: "8px 10px 6px",
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
            <Check size={10} color="#fff" strokeWidth={3.5} />
          </div>
        )}

        {isNameMode ? (
          <div
            title={s.name || s.label}
            style={{
              fontWeight: 700,
              fontSize: "var(--dg-fs-caption)",
              color: s.text,
              opacity: isActive ? 1 : 0.75,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: isActive ? 20 : 0,
            }}
          >
            {s.name || s.label}
          </div>
        ) : (
          <>
            <div
              style={{
                fontWeight: 800,
                fontSize: "var(--dg-fs-caption)",
                color: s.text,
                opacity: isActive ? 1 : 0.75,
                display: "flex",
                alignItems: "center",
                gap: 3,
                paddingRight: isActive ? 20 : 0,
              }}
            >
              {s.label}
            </div>
            <div
              title={s.name}
              style={{
                fontSize: "var(--dg-fs-micro)",
                color: "var(--color-text-subtle)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: isActive ? 20 : 0,
              }}
            >
              {s.name}
            </div>
          </>
        )}

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

        {absenceTypes.length > 0 && (
          <div>
            <div style={sectionHeading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Off Days
              <span style={countPill}>{absenceTypes.length}</span>
              <div style={headingLine} />
            </div>
            <div role="group" aria-label="Off day options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {absenceTypes.map((at) => {
                const isActive = currentAbsenceTypeId === at.id;
                return (
                  <button
                    key={at.id}
                    onClick={() => {
                      onAbsenceSelect?.(at);
                      if (closeOnSelect && !multiSelect) onClose?.();
                    }}
                    aria-pressed={isActive}
                    aria-label={`${at.label} - ${at.name}`}
                    style={{
                      background: isActive ? at.color : `${at.color}40`,
                      border: `1.5px solid ${isActive ? at.border : at.text}`,
                      borderRadius: 8,
                      padding: "8px 10px 6px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, transform 150ms ease",
                      position: "relative",
                      boxShadow: isActive ? "inset 0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `${at.color}70`;
                        e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `${at.color}40`;
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
                          background: at.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={10} color="#fff" strokeWidth={3.5} />
                      </div>
                    )}
                    {isNameMode ? (
                      <div
                        title={at.name || at.label}
                        style={{
                          fontWeight: 700,
                          fontSize: "var(--dg-fs-caption)",
                          color: at.text,
                          opacity: isActive ? 1 : 0.75,
                          lineHeight: 1.3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          paddingRight: isActive ? 20 : 0,
                        }}
                      >
                        {at.name || at.label}
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "var(--dg-fs-caption)",
                            color: at.text,
                            opacity: isActive ? 1 : 0.75,
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            paddingRight: isActive ? 20 : 0,
                          }}
                        >
                          {at.label}
                        </div>
                        <div title={at.name} style={{ fontSize: "var(--dg-fs-micro)", color: "var(--color-text-subtle)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: isActive ? 20 : 0 }}>
                          {at.name}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {areaShifts.length === 0 && generalNonOffShifts.length === 0 && absenceTypes.length === 0 && (
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
