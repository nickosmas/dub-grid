export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? "text-foreground" : "text-muted-foreground/40"}
    >
      <path d="m7 15 5 5 5-5" opacity={!active || dir === "desc" ? 1 : 0.3} />
      <path d="m7 9 5-5 5 5" opacity={!active || dir === "asc" ? 1 : 0.3} />
    </svg>
  );
}
