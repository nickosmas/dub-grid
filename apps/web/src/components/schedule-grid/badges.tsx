import { UserPen } from "lucide-react";
import { MaybeHint } from "@/components/ui/hint";
import { PublishDiffPill } from "./publishDiffPill";

export type GridDiffBadgeConfig = {
  source: "publish" | "draft";
  kind: "new" | "modified" | "time" | "deleted";
  text: string;
  tooltip?: string;
  topOffset?: number;
  rightOffset?: number;
  leftOffset?: number;
};

export function shouldUseShiftColorForDiffState(args: { isCross: boolean }): boolean {
  return !args.isCross;
}

export function GridDiffBadge({ badge }: { badge: GridDiffBadgeConfig }) {
  const topOffset = badge.topOffset ?? 1;
  const rightOffset = badge.rightOffset ?? 1;
  const leftOffset = badge.leftOffset;
  const dataAttributes =
    badge.source === "publish"
      ? { "data-publish-badge": badge.kind }
      : { "data-draft-badge": badge.kind };
  const badgeNode = (
    <PublishDiffPill
      kind={badge.kind}
      {...dataAttributes}
      aria-label={badge.tooltip ?? badge.text}
      style={{
        position: "absolute",
        top: topOffset,
        ...(leftOffset != null
          ? {
              left: leftOffset,
              maxWidth: `calc(100% - ${leftOffset + 4}px)`,
            }
          : {
              right: rightOffset,
              maxWidth: "calc(100% - 4px)",
            }),
        borderRadius: 3,
        pointerEvents: badge.tooltip ? "auto" : "none",
        zIndex: 6,
      }}
    >
      {badge.text}
    </PublishDiffPill>
  );

  if (!badge.tooltip) {
    return badgeNode;
  }

  return (
    <MaybeHint content={badge.tooltip} side="top">
      {badgeNode}
    </MaybeHint>
  );
}

export function MentoredShiftBadge({ compact = false }: { compact?: boolean }) {
  const size = compact ? 15 : 16;
  const badge = (
    <span
      data-mentored-badge="true"
      aria-label="Mentored assignment"
      style={{
        position: "absolute",
        top: 0.5,
        right: 0.5,
        width: size,
        height: size,
        borderRadius: 999,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(51,65,85,0.22)",
        color: "#334155",
        boxShadow: "0 1px 2px rgba(15,23,42,0.12)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: compact ? 8 : 9,
        fontWeight: 800,
        lineHeight: 1,
        pointerEvents: "auto",
        zIndex: 5,
      }}
    >
      M
    </span>
  );

  return (
    <MaybeHint content="Mentored assignment" side="top">
      {badge}
    </MaybeHint>
  );
}

export function AuthorBadge({
  name,
  leftInset = 5,
  rightInset = 5,
  bottomInset = 5,
}: {
  name: string;
  leftInset?: number;
  rightInset?: number;
  bottomInset?: number;
}) {
  return (
    <div
      data-author-pill="true"
      style={{
        position: "absolute",
        left: leftInset,
        right: rightInset,
        bottom: bottomInset,
        display: "flex",
        justifyContent: "flex-start",
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 4,
          minWidth: 0,
          maxWidth: "100%",
          fontSize: "var(--dg-fs-micro)",
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: "left",
          color: "var(--color-text-muted)",
          padding: "2px 7px",
          background: "var(--color-surface)",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 0.5px 1px rgba(0,0,0,0.06)",
          textDecoration: "none",
        }}
      >
        <span
          aria-hidden="true"
          data-author-pill-icon="true"
          style={{
            flexShrink: 0,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserPen size={10} strokeWidth={2.2} />
        </span>
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </span>
    </div>
  );
}
