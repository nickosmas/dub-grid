export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 24,
        justifyContent: "flex-end",
      }}
    >
      {children}
    </div>
  );
}
