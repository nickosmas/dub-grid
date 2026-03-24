import { AnimatedDubGridLogo } from "@/components/Logo";

export default function OnboardingLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
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
        Loading...
      </span>
    </div>
  );
}
