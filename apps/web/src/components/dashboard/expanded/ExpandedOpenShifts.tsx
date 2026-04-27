import { useState, useMemo } from "react";
import type { OpenShift } from "@/lib/dashboard-stats";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";

const BADGE_STYLES: Record<
  OpenShift["urgency"],
  { bg: string; color: string; border: string; label: string }
> = {
  high: {
    bg: "var(--color-danger-bg)",
    color: "var(--color-danger)",
    border: "var(--color-danger-border)",
    label: "Urgent",
  },
  medium: {
    bg: "var(--color-warning-bg)",
    color: "var(--color-warning)",
    border: "var(--color-warning-border)",
    label: "Open",
  },
  low: {
    bg: "var(--color-success-bg)",
    color: "var(--color-success-text)",
    border: "var(--color-success-border)",
    label: "Open",
  },
};

const URGENCY_OPTIONS = ["all", "high", "medium", "low"] as const;

interface ExpandedOpenShiftsProps {
  openShifts: OpenShift[];
  publishedWindowState?: PublishedWindowState;
  onClose: () => void;
}

export default function ExpandedOpenShifts({
  openShifts,
  publishedWindowState = "published",
  onClose,
}: ExpandedOpenShiftsProps) {
  const [urgencyFilter, setUrgencyFilter] = useState<
    "all" | OpenShift["urgency"]
  >("all");
  const [focusAreaFilter, setFocusAreaFilter] = useState<string>("all");
  const isUnpublished = publishedWindowState === "unpublished";
  const isPartial = publishedWindowState === "partial";

  const filtered = useMemo(() => {
    let list = openShifts;
    if (urgencyFilter !== "all")
      list = list.filter((s) => s.urgency === urgencyFilter);
    if (focusAreaFilter !== "all")
      list = list.filter((s) => s.focusAreaName === focusAreaFilter);
    return list;
  }, [openShifts, urgencyFilter, focusAreaFilter]);

  const focusAreaNames = useMemo(
    () => [...new Set(openShifts.map((s) => s.focusAreaName))].sort(),
    [openShifts],
  );

  return (
    <Modal title="Open shifts" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isUnpublished ? (
          <div style={emptyStyle}>
            This period has not been published yet. Open shifts will appear
            after the first publish.
          </div>
        ) : (
          <>
            {isPartial && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--dg-radius-sm)",
                  background: "var(--color-bg)",
                  border: "1px dashed var(--color-border)",
                  fontSize: 11,
                  color: "var(--color-text-subtle)",
                }}
              >
                Showing published dates only.
              </div>
            )}
            {/* Filters */}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                padding: 16,
                borderRadius: "var(--dg-radius-md)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <span style={filterLabelStyle}>Filter:</span>
              <CustomSelect
                value={urgencyFilter}
                options={URGENCY_OPTIONS.map((opt) => ({
                  value: opt,
                  label:
                    opt === "all"
                      ? "All urgency"
                      : opt.charAt(0).toUpperCase() + opt.slice(1),
                }))}
                onChange={(val) =>
                  setUrgencyFilter(val as typeof urgencyFilter)
                }
                fontSize="var(--dg-fs-label)"
              />
              <CustomSelect
                value={focusAreaFilter}
                options={[
                  { value: "all", label: "All sections" },
                  ...focusAreaNames.map((name) => ({
                    value: name,
                    label: name,
                  })),
                ]}
                onChange={setFocusAreaFilter}
                fontSize="var(--dg-fs-label)"
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-subtle)",
                  marginLeft: "auto",
                }}
              >
                {filtered.length} shift{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* List */}
            <div
              style={{
                maxHeight: "60vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {filtered.length === 0 ? (
                <div style={emptyStyle}>
                  {isPartial
                    ? "No open shifts on published dates"
                    : "No open shifts matching filters"}
                </div>
              ) : (
                filtered.map((shift) => {
                  const badge = BADGE_STYLES[shift.urgency];
                  const metaText = [
                    shift.focusAreaName,
                    shift.timeRange,
                    shift.needed > 1 ? `${shift.needed} needed` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={shift.id} style={itemStyle}>
                      <div style={{ textAlign: "center", minWidth: 40 }}>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-subtle)",
                            fontWeight: 500,
                          }}
                        >
                          {shift.dayOfWeek}
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: "var(--color-text-primary)",
                            lineHeight: 1,
                          }}
                        >
                          {shift.dayOfMonth}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 1,
                          height: 40,
                          background: "var(--color-border)",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {shift.assignmentLabel}
                        </div>
                        {metaText ? (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--color-text-subtle)",
                              marginTop: 2,
                            }}
                          >
                            {metaText}
                          </div>
                        ) : null}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: 5,
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };

const filterLabelStyle = {
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const itemStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 12,
  padding: "14px 16px",
  borderRadius: "var(--dg-radius-md)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
};

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};
