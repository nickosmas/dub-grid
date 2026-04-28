import type { OpenShift } from "@/lib/dashboard-stats";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import ExpandButton from "./ExpandButton";
import DashboardEmptyState from "./DashboardEmptyState";

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

interface OpenShiftsCardProps {
  openShifts: OpenShift[];
  publishedWindowState?: PublishedWindowState;
  maxVisible?: number;
  onExpand?: () => void;
  onVolunteer?: (shift: OpenShift) => void;
}

export default function OpenShiftsCard({
  openShifts,
  publishedWindowState = "published",
  maxVisible = 5,
  onExpand,
  onVolunteer,
}: OpenShiftsCardProps) {
  const visible = openShifts.slice(0, maxVisible);
  const remainingCount = Math.max(0, openShifts.length - visible.length);
  const isUnpublished = publishedWindowState === "unpublished";
  const isPartial = publishedWindowState === "partial";
  const subtitle = isUnpublished
    ? "Not published yet"
    : isPartial
      ? `${openShifts.length} unfilled across published dates`
      : `${openShifts.length} unfilled this week`;

  return (
    <div className="dg-card">
      {/* Header */}
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Open shifts</div>
          <div className="dg-card-subtitle">{subtitle}</div>
        </div>
        {onExpand && (
          <ExpandButton onClick={onExpand} label="Expand open shifts" />
        )}
      </div>

      <div className="dg-card-body">
        {openShifts.length === 0 ? (
          <DashboardEmptyState
            title={
              isUnpublished
                ? "Not published yet"
                : isPartial
                  ? "No open shifts on published dates"
                  : "All shifts covered this week"
            }
            description={
              isUnpublished
                ? "Open shifts will appear after this period is published."
                : isPartial
                  ? "Only published dates are counted here."
                  : undefined
            }
            variant="inline"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((shift) => {
              const badge = BADGE_STYLES[shift.urgency];
              const metaText = [
                shift.focusAreaName,
                shift.timeRange,
                shift.needed > 1 ? `${shift.needed} needed` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={shift.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 16px",
                    borderRadius: "var(--dg-radius-md)",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {/* Date block */}
                  <div style={{ textAlign: "center", minWidth: 34 }}>
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
                        fontSize: 16,
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
                      height: 36,
                      background: "var(--color-border)",
                    }}
                  />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {shift.assignmentLabel}
                    </div>
                    {metaText ? (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-subtle)",
                          marginTop: 1,
                        }}
                      >
                        {metaText}
                      </div>
                    ) : null}
                  </div>

                  {/* Badge + Volunteer */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 5,
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {badge.label}
                    </span>
                    {onVolunteer && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          onVolunteer(shift);
                        }}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 5,
                          background: "var(--color-brand)",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Volunteer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {remainingCount > 0 && (
              <div
                style={{
                  padding: "2px 2px 0",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--color-text-subtle)",
                }}
              >
                {remainingCount} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
