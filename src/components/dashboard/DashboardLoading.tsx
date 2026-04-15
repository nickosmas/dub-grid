import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gap: 12,
          padding: "20px",
          background: "var(--color-surface)",
          borderRadius: 16,
          border: "1px solid var(--color-border)",
        }}
      >
        <Skeleton
          className="dg-skeleton dg-skeleton--pill"
          style={{ width: "22%", height: 20 }}
        />
        <Skeleton
          className="dg-skeleton dg-skeleton--heading"
          style={{ width: "35%" }}
        />
        <Skeleton
          className="dg-skeleton dg-skeleton--text"
          style={{ width: "80%" }}
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Skeleton
            className="dg-skeleton dg-skeleton--button"
            style={{ width: 120, height: 40 }}
          />
          <Skeleton
            className="dg-skeleton dg-skeleton--button"
            style={{ width: 120, height: 40 }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <Skeleton className="dg-skeleton dg-skeleton--card" />
        <Skeleton className="dg-skeleton dg-skeleton--card" />
      </div>

      <Skeleton className="dg-skeleton dg-skeleton--card" />
      <Skeleton className="dg-skeleton dg-skeleton--card" />
    </div>
  );
}
