import { UserPen } from "lucide-react";
import { MaybeHint } from "@/components/ui/hint";
import type { ActiveShiftRequestStatus } from "@/types";
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

/** Diameter of the note dot rendered for each active indicator, and its gap. */
export const NOTE_DOT_SIZE = 10;
export const NOTE_DOT_GAP = 2;

/** Horizontal run the note dots claim for `count` indicators. */
export function noteDotsWidth(count: number): number {
  if (count <= 0) return 0;
  return count * NOTE_DOT_SIZE + (count - 1) * NOTE_DOT_GAP;
}

/**
 * How much of a pill's top-right corner the mentored "M" already claims,
 * plus a gap. Anything else anchored to that corner — a diff badge, the note
 * dots — has to start past this or it lands on top of the circle. The badge
 * outranks it in z-order, so the collision reads as a clipped "M" rather than
 * a hidden badge, which is how "+ Mentored" ended up covering the very mark
 * it was announcing.
 */
export const MENTORED_CORNER_CLEARANCE = 21;

/**
 * The lock avatar is 20px at inset 2, and it is the one thing in the top-right
 * corner that explains a blocked interaction — so it sits outermost and the
 * rest of the stack starts past it. Without this the mentored "M" (z5) covered
 * the avatar (z2), hiding the name of whoever is holding the cell.
 */
export const LOCK_CORNER_CLEARANCE = 26;

/** Leg length of the request corner fold, and the room a neighbour must leave it. */
export const REQUEST_FOLD_SIZE = 16;
/**
 * Derived, not a second literal: the clearance only ever means "the fold plus a
 * little air", so resizing the fold used to mean remembering to move this too,
 * and a stale value here parks the diff badge on top of the triangle.
 */
export const REQUEST_FOLD_CLEARANCE = REQUEST_FOLD_SIZE + 4;

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
              // Mirrors the left-anchored branch: the cap has to grow with the
              // offset, or a badge pushed inward to clear the corner simply
              // spills the same distance past the pill's other edge.
              maxWidth: `calc(100% - ${rightOffset + 4}px)`,
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

export function MentoredShiftBadge({
  compact = false,
  rightInset = 0.5,
}: {
  compact?: boolean;
  /** Pushed inward when something outranks it in the corner — see LOCK_CORNER_CLEARANCE. */
  rightInset?: number;
}) {
  const size = compact ? 15 : 16;
  const badge = (
    <span
      data-mentored-badge="true"
      aria-label="Mentored assignment"
      style={{
        position: "absolute",
        top: 0.5,
        right: rightInset,
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
        fontWeight: 600,
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

/**
 * Fill for the request fold, deliberately not `SHIFT_REQUEST_STATUS_COLORS`.
 * That table is built for the requests board's soft chips — a pale background
 * carrying dark text — and a 12px solid triangle drawn in its `border` tint is
 * all but invisible against a shift pill, near-black in dark mode. These two
 * hold their value in both themes because `--color-danger` and
 * `--color-warning` are the same hex in each.
 *
 * Red is the unclaimed state: an open request is coverage nobody has taken yet,
 * which is what a scheduler has to chase. Orange is the in-motion state, and
 * keeps pending approval on the same warning axis the board already puts it on.
 */
const REQUEST_FOLD_COLORS: Record<ActiveShiftRequestStatus, string> = {
  open: "var(--dg-color-danger)",
  pending_approval: "var(--dg-color-warning)",
};

/**
 * Marks a shift that has a request against it — an open pickup, or a swap
 * waiting on an approver. Drawn as a triangular fold in the pill's top-left so
 * it claims no horizontal room: every corner of a cell already has a
 * conditional occupant, and a chip here would push one of them out of place.
 * Sits above the cross-focus strip and below the diff badge.
 */
export function RequestCornerFold({
  status,
  label,
}: {
  status: ActiveShiftRequestStatus;
  label: string;
}) {
  const fill = REQUEST_FOLD_COLORS[status];

  return (
    <MaybeHint content={label} side="top">
      <span
        data-request-fold={status}
        aria-label={label}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          borderTop: `${REQUEST_FOLD_SIZE}px solid ${fill}`,
          borderRight: `${REQUEST_FOLD_SIZE}px solid transparent`,
          borderTopLeftRadius: 2,
          pointerEvents: "auto",
          zIndex: 4,
        }}
      />
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
          color: "var(--dg-color-text-muted)",
          padding: "2px 7px",
          background: "var(--dg-color-surface)",
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
