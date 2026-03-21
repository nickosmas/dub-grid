import { AnimatedDubGridLogo } from "@/components/Logo";

export default function StaffLoading() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
          Loading staff...
        </span>
      </div>
    </div>
  );
}
