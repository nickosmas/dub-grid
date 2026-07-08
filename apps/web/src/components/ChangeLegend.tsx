import {
  getPublishDiffTone,
  type PublishDiffPillKind,
} from "@/components/schedule-grid/publishDiffPill";

const CHANGE_LEGEND_ITEMS: Array<{
  kind: Extract<PublishDiffPillKind, "new" | "modified" | "deleted">;
  label: string;
}> = [
  { kind: "new" as const, label: "New" },
  { kind: "modified" as const, label: "Edited" },
  { kind: "deleted" as const, label: "Deleted" },
];

export default function ChangeLegend() {
  return (
    <div
      aria-label="Change color key"
      data-change-legend="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 700,
          color: "var(--color-text-muted)",
        }}
      >
        Key
      </span>
      {CHANGE_LEGEND_ITEMS.map((item) => {
        const tone = getPublishDiffTone(item.kind);
        return (
          <span
            key={item.kind}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 700,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            <span
              aria-hidden="true"
              data-change-legend-dot={item.kind}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: tone.background,
                boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.75), 0 0 0 2px rgba(15, 23, 42, 0.08)",
                flexShrink: 0,
              }}
            />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
