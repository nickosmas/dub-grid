import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardLoadingVariant = "admin" | "user";

const cardStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 12,
  padding: "20px",
  background: "var(--dg-color-surface)",
  borderRadius: "var(--dg-radius-md)",
  border: "1px solid var(--dg-color-border)",
};

const twoColumnStyle = (stacked: boolean): CSSProperties => ({
  display: "grid",
  gap: "var(--dg-space-lg)",
  gridTemplateColumns: stacked ? "1fr" : "1fr 1fr",
});

/** A card as the dashboard draws it: title, subtitle, then its rows. */
function CardSkeleton({
  rows,
  rowHeight = 44,
  style,
}: {
  rows: number;
  rowHeight?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...cardStyle, ...style }}>
      <Skeleton className="dg-skeleton dg-skeleton--heading" style={{ width: "38%" }} />
      <Skeleton className="dg-skeleton dg-skeleton--text" style={{ width: "62%" }} />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          className="dg-skeleton"
          key={index}
          style={{ height: rowHeight, width: index % 2 === 0 ? "100%" : "92%" }}
        />
      ))}
    </div>
  );
}

/**
 * The dashboard's placeholder, drawn for the dashboard the viewer will get.
 *
 * A manager's page is four full-width bands: the action queue, their own
 * schedule row, then coverage beside open shifts and activity beside overtime.
 * A staff member's page is a tall hero beside two short cards, their week
 * under it, and a rail of open shifts and requests down the right. One
 * silhouette for both promised each viewer cards the other one has.
 */
export default function DashboardLoading({
  variant = "admin",
  isMobile = false,
  isTablet = false,
}: {
  variant?: DashboardLoadingVariant;
  isMobile?: boolean;
  isTablet?: boolean;
}) {
  const stacked = isMobile || isTablet;

  if (variant === "user") {
    const topGrid = (
      <div
        style={{
          display: "grid",
          columnGap: "var(--dg-space-xl)",
          rowGap: "var(--dg-space-lg)",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 680px) minmax(320px, 1fr)",
        }}
      >
        <div
          style={{
            ...cardStyle,
            gridColumn: isMobile ? undefined : "1",
            gridRow: isMobile ? undefined : "1 / span 2",
            minHeight: isMobile ? 220 : 320,
          }}
        >
          <Skeleton className="dg-skeleton" style={{ width: 96, height: 24, borderRadius: 999 }} />
          <Skeleton
            className="dg-skeleton dg-skeleton--heading"
            style={{ width: "58%", height: 32 }}
          />
          <Skeleton className="dg-skeleton dg-skeleton--text" style={{ width: "44%" }} />
          <Skeleton className="dg-skeleton dg-skeleton--text" style={{ width: "36%" }} />
        </div>
        <CardSkeleton rows={1} rowHeight={40} />
        <CardSkeleton rows={2} rowHeight={40} />
      </div>
    );
    const myWeek = <CardSkeleton rows={7} rowHeight={56} />;
    const rail = (
      <CardSkeleton rows={3} rowHeight={88} style={stacked ? undefined : { width: 360 }} />
    );

    if (stacked) {
      return (
        <div style={{ display: "grid", gap: "var(--dg-space-xl)" }}>
          {topGrid}
          {rail}
          {myWeek}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", columnGap: "var(--dg-space-xl)", alignItems: "flex-start" }}>
        <div style={{ display: "grid", flex: 1, gap: "var(--dg-space-xl)", minWidth: 0 }}>
          {topGrid}
          {myWeek}
        </div>
        {rail}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--dg-space-lg)" }}>
      <CardSkeleton rows={5} />
      <CardSkeleton rows={1} rowHeight={72} />
      <div style={twoColumnStyle(stacked)}>
        <CardSkeleton rows={4} />
        <CardSkeleton rows={4} />
      </div>
      <div style={twoColumnStyle(stacked)}>
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
      </div>
    </div>
  );
}
