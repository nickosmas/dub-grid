import ProgressBar from "@/components/ProgressBar";

export default function GridmasterLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-dark)" }}>
      <ProgressBar loading />
    </div>
  );
}
