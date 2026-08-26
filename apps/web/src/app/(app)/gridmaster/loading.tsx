import ProgressBar from "@/components/ProgressBar";

export default function GridmasterLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--dg-color-dark)" }}>
      <ProgressBar loading />
    </div>
  );
}
