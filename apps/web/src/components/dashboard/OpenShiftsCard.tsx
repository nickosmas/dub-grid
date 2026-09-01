import Link from "next/link";
import type { CSSProperties } from "react";
import { formatPublishedAt, formatPublishedSummary } from "@dubgrid/schedule-core";
import type { OpenShift } from "@/lib/dashboard-stats";
import { Button } from "@/components/Button";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import type { PublishHistoryEntryWithName } from "@/types";
import ExpandButton from "./ExpandButton";
import { EmptyState } from "@/components/EmptyState";

const BADGE_STYLES: Record<
  OpenShift["urgency"],
  { bg: string; color: string; border: string; label: string }
> = {
  high: {
    bg: "var(--dg-color-danger-bg)",
    color: "var(--dg-color-danger)",
    border: "var(--dg-color-danger-border)",
    label: "Urgent",
  },
  medium: {
    bg: "var(--dg-color-warning-bg)",
    color: "var(--dg-color-warning)",
    border: "var(--dg-color-warning-border)",
    label: "Open",
  },
  low: {
    bg: "var(--dg-color-success-bg)",
    color: "var(--dg-color-success-text)",
    border: "var(--dg-color-success-border)",
    label: "Open",
  },
};

interface OpenShiftsCardProps {
  openShifts: OpenShift[];
  publishedWindowState?: PublishedWindowState;
  /** Most recent publish for the current period — who and when. */
  publishHistory?: PublishHistoryEntryWithName | null;
  orgTimeZone?: string | null;
  maxVisible?: number;
  periodLabel?: string;
  onExpand?: () => void;
  onVolunteer?: (shift: OpenShift) => void;
}

export default function OpenShiftsCard({
  openShifts,
  publishedWindowState = "published",
  publishHistory,
  orgTimeZone,
  maxVisible = 5,
  periodLabel = "this week",
  onExpand,
  onVolunteer,
}: OpenShiftsCardProps) {
  const visible = openShifts.slice(0, maxVisible);
  const remainingCount = Math.max(0, openShifts.length - visible.length);
  const openSlotCount = openShifts.reduce((total, shift) => total + shift.needed, 0);
  const isUnpublished = publishedWindowState === "unpublished";
  const isPartial = publishedWindowState === "partial";
  const subtitle = isUnpublished
    ? "Not published yet"
    : isPartial
      ? `${openSlotCount} unfilled across published dates`
      : `${openSlotCount} unfilled ${periodLabel}`;
  const publishSummary =
    !isUnpublished && publishHistory
      ? formatPublishedSummary(
          publishHistory.publishedByName,
          formatPublishedAt(publishHistory.publishedAt, orgTimeZone),
        )
      : null;

  return (
    <div className="dg-card" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Open shifts</div>
          <div className="dg-card-subtitle">{subtitle}</div>
          {publishSummary && (
            <div
              style={{
                fontSize: "var(--dg-type-metadata-size)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              {publishSummary}
            </div>
          )}
        </div>
        {onExpand && <ExpandButton onClick={onExpand} label="Expand open shifts" />}
      </div>

      <div
        className="dg-card-body"
        style={openShifts.length === 0 ? { display: "flex", flex: 1 } : undefined}
      >
        {openShifts.length === 0 ? (
          <EmptyState
            title={
              isUnpublished
                ? "Not published yet"
                : isPartial
                  ? "No open shifts on published dates"
                  : `All shifts covered ${periodLabel}`
            }
            description={
              isUnpublished
                ? "Open shifts will appear after this period is published."
                : isPartial
                  ? "Only published dates are counted here."
                  : undefined
            }
            size="inline"
            style={{ flex: 1 }}
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
              const rowStyle: CSSProperties = {
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderRadius: "var(--dg-radius-md)",
                background: "var(--dg-color-bg)",
                border: "1px solid var(--dg-color-border)",
              };
              const rowContent = (
                <div style={rowStyle}>
                  {/* Date block */}
                  <div style={{ textAlign: "center", minWidth: 34 }}>
                    <div
                      style={{
                        fontSize: "var(--dg-type-metadata-size)",
                        color: "var(--dg-color-text-subtle)",
                        fontWeight: 500,
                      }}
                    >
                      {shift.dayOfWeek}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "var(--dg-color-text-primary)",
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
                      background: "var(--dg-color-border)",
                    }}
                  />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--dg-color-text-primary)",
                      }}
                    >
                      {shift.assignmentLabel}
                    </div>
                    {metaText ? (
                      <div
                        style={{
                          fontSize: "var(--dg-type-metadata-size)",
                          color: "var(--dg-color-text-subtle)",
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
                        fontSize: "var(--dg-type-control-size)",
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
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          onVolunteer(shift);
                        }}
                        style={{
                          fontSize: "var(--dg-type-control-size)",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 5,
                          background: "var(--dg-color-brand)",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Volunteer
                      </Button>
                    )}
                  </div>
                </div>
              );
              return onVolunteer ? (
                <div key={shift.id}>{rowContent}</div>
              ) : (
                <Link
                  key={shift.id}
                  href="/schedule"
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  {rowContent}
                </Link>
              );
            })}
            {remainingCount > 0 && (
              <div
                style={{
                  padding: "2px 2px 0",
                  fontSize: "var(--dg-type-metadata-size)",
                  fontWeight: 600,
                  color: "var(--dg-color-text-subtle)",
                }}
              >
                {remainingCount} more gap{remainingCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
