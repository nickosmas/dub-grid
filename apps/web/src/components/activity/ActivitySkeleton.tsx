"use client";

const BAR_WIDTHS = ["18%", "14%", "20%", "34%"];

export function ActivitySkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="dg-activity-table-shell" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="dg-activity-skeleton-row">
          {BAR_WIDTHS.map((width) => (
            <div key={width} className="dg-skeleton dg-skeleton--text" style={{ width }} />
          ))}
        </div>
      ))}
    </div>
  );
}
