export default function GridmasterLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-dark)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid rgba(148, 163, 184, 0.3)",
          borderTopColor: "#94A3B8",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
