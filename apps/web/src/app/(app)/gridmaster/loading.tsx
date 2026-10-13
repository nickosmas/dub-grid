import ProgressBar from "@/components/ProgressBar";

export default function GridmasterLoading() {
  return (
    <div
      style={{
        minHeight: "calc(100dvh - var(--dg-app-shell-header-height))",
        background: "var(--dg-color-dark)",
      }}
    >
      <ProgressBar loading />
    </div>
  );
}
