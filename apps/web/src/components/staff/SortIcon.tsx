/**
 * Sort indicator next to a sortable column header. Single filled triangle:
 * points up for asc, rotated 180° for desc. Dimmed when the column isn't
 * the active sort key so the column stays clickable without shouting.
 */
export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      style={{
        opacity: active ? 1 : 0.25,
        transform: dir === "desc" ? "rotate(180deg)" : undefined,
        transition: "transform 120ms ease",
      }}
    >
      {/* Solid triangle pointing up; rotates 180° via CSS transform for desc. */}
      <path d="M6 2 L11 10 L1 10 Z" />
    </svg>
  );
}
