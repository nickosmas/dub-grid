import { AnimatedDubGridLogo } from "@/components/Logo";

export default function ScheduleLoading() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Skeleton toolbar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <div className="dg-skeleton" style={{ width: 120, height: 32 }} />
        <div className="dg-skeleton" style={{ width: 180, height: 32 }} />
        <div style={{ flex: 1 }} />
        <div className="dg-skeleton" style={{ width: 100, height: 32 }} />
      </div>
      {/* Centered logo */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <AnimatedDubGridLogo size={48} />
        <span
          style={{
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-faint)",
            fontWeight: 500,
          }}
        >
          Loading schedule...
        </span>
      </div>
    </div>
  );
}
