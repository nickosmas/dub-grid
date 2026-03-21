import { AnimatedDubGridLogo } from "@/components/Logo";

export default function GridmasterLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
        background: "#0F172A",
      }}
    >
      <AnimatedDubGridLogo size={48} color="#94A3B8" />
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          color: "#64748B",
          fontWeight: 500,
        }}
      >
        Loading...
      </span>
    </div>
  );
}
