import type { ComponentPropsWithoutRef, CSSProperties } from "react";

export type PublishDiffPillKind = "new" | "modified" | "time" | "deleted";

type PublishDiffTone = {
  background: string;
  text: string;
};

export function getPublishDiffTone(kind: PublishDiffPillKind): PublishDiffTone {
  switch (kind) {
    case "new":
      return {
        background: "rgba(22, 163, 74, 0.94)",
        text: "var(--color-text-inverse)",
      };
    case "modified":
    case "time":
      return {
        background: "rgba(217, 119, 6, 0.94)",
        text: "var(--color-text-inverse)",
      };
    case "deleted":
      return {
        background: "rgba(220, 38, 38, 0.94)",
        text: "var(--color-text-inverse)",
      };
    default:
      return {
        background: "rgba(22, 163, 74, 0.94)",
        text: "var(--color-text-inverse)",
      };
  }
}

const basePublishDiffPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "100%",
  fontSize: "var(--dg-fs-badge)",
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  padding: "2px 6px",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: 3,
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.18)",
  letterSpacing: "0.01em",
};

type PublishDiffPillProps = ComponentPropsWithoutRef<"span"> & {
  kind: PublishDiffPillKind;
};

export function PublishDiffPill({ kind, style, children, ...props }: PublishDiffPillProps) {
  const tone = getPublishDiffTone(kind);

  return (
    <span
      {...props}
      style={{
        ...basePublishDiffPillStyle,
        color: tone.text,
        background: tone.background,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
