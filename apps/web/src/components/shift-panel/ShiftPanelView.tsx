"use client";

import type { ReactNode } from "react";
import type { ShiftChange } from "@dubgrid/schedule-core";
import { ShiftChangeWas } from "@/components/shift-change/ShiftChangeCard";

export interface PanelViewDetail {
  label: string;
  value: ReactNode;
}

export type PanelViewStatus =
  { kind: "unpublished"; personName: string } | { kind: "changed"; change: ShiftChange } | null;

interface ShiftPanelViewProps {
  /** The cell's shifts or absence, drawn as in the day editor. */
  header: ReactNode;
  details: PanelViewDetail[];
  status: PanelViewStatus;
  series: ReactNode;
  lastChange: string | null;
}

const card: React.CSSProperties = {
  background: "var(--dg-color-surface)",
  border: "1px solid var(--dg-color-border)",
  borderRadius: "var(--dg-radius-lg)",
};

function StatusHeading({
  title,
  detail,
  dotColor,
}: {
  title: string;
  detail?: ReactNode;
  dotColor: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          marginTop: 6,
          borderRadius: 4,
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {title}
        </div>
        {detail ? (
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              marginTop: 2,
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const statusCard: React.CSSProperties = {
  ...card,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

function StatusCard({ status }: { status: NonNullable<PanelViewStatus> }) {
  return (
    <div style={statusCard}>
      <StatusHeading
        title={
          status.kind === "unpublished" ? "Not published yet" : "Changed since it was published"
        }
        detail={
          status.kind === "unpublished"
            ? `${status.personName} sees this once you publish.`
            : undefined
        }
        dotColor="var(--dg-color-warning-text)"
      />
      {status.kind === "changed" ? <ShiftChangeWas change={status.change} /> : null}
    </div>
  );
}

/**
 * A corrected past day, above the shift as it stands: when and by whom, the
 * reason, and what the day was. An addition shows no before; the shift is below.
 */
export function CorrectedDayCard({
  change,
  notes,
  detail,
}: {
  change: ShiftChange | null;
  /** What the correction changed that the change model leaves out, such as mentoring. */
  notes: string[];
  /** When, by whom, and the reason on its own line. */
  detail: string;
}) {
  const [summary, ...rest] = detail.split("\n");
  return (
    <ChangeCard
      data={{ "data-corrected-day": true }}
      title={summary ?? detail}
      detail={
        rest.length > 0 ? (
          <span data-correction-notice style={{ whiteSpace: "pre-line" }}>
            {rest.join("\n")}
          </span>
        ) : undefined
      }
      change={change}
      notes={notes}
    />
  );
}

/**
 * The change the highlighted publish made to this day: when and by whom it was
 * published, then what the day was. The shift's own chip already says New or
 * Changed, so an addition is the publication line alone.
 */
export function PublishedChangeCard({
  change,
  notes,
  publication,
}: {
  /** Null when the organization hides change details from this viewer (item 46f). */
  change: ShiftChange | null;
  /** What the publish changed that the change model leaves out, such as mentoring. */
  notes: string[];
  /** When it was published, and by whom when the viewer may see that. */
  publication: string;
}) {
  return (
    <ChangeCard
      data={{ "data-published-change": true }}
      title={publication}
      change={change}
      notes={notes}
    />
  );
}

function ChangeCard({
  data,
  title,
  detail,
  change,
  notes,
}: {
  data: Record<string, boolean>;
  title: string;
  detail?: ReactNode;
  change: ShiftChange | null;
  notes: string[];
}) {
  const shownChange = change && change.kind !== "none" ? change : null;
  return (
    <div {...data} style={{ ...statusCard, marginBottom: 16 }}>
      <StatusHeading title={title} detail={detail} dotColor="var(--dg-color-text-muted)" />
      {shownChange || notes.length > 0 ? (
        <div data-change-was style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shownChange ? <ShiftChangeWas change={shownChange} /> : null}
          {notes.map((note) => (
            <p
              key={note}
              style={{
                margin: 0,
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-secondary)",
              }}
            >
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One waiting request on the day, as the grid's hover card lists it (item 57a). */
export interface PanelRequestCard {
  requestId: string;
  waitingOn: "teammate" | "manager";
  status: string;
  body: string | null;
  asked: string;
  /** True while it waits for a manager, the only time Approve and Reject apply. */
  awaitingApproval: boolean;
  /** The note field's prompt, naming who the note goes to, as on the Requests board. */
  notePlaceholder: string;
  /** "Call-off", "Swap" or "Pickup", for the chip on the shift it concerns. */
  kind: string;
  /** The day's shifts the request concerns, by index. */
  affectedSegmentIndexes: number[];
}

/**
 * A waiting request on this day: who acts next (the fold), what would happen
 * and when it was asked, with any actions the viewer may take below.
 */
export function RequestCard({ card, actions }: { card: PanelRequestCard; actions?: ReactNode }) {
  return (
    <div data-request-card={card.waitingOn} style={{ ...statusCard, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 0,
            height: 0,
            borderTop: `12px solid ${
              card.waitingOn === "manager"
                ? "var(--dg-color-warning)"
                : "var(--dg-color-text-muted)"
            }`,
            borderRight: "12px solid transparent",
          }}
        />
        <div
          style={{
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {card.status}
        </div>
      </div>
      {card.body ? (
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-secondary)",
            lineHeight: 1.45,
          }}
        >
          {card.body}
        </p>
      ) : null}
      <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {card.asked}
      </div>
      {actions}
    </div>
  );
}

/** What a repeating item holds and how it repeats, before anything is edited. */
export function ShiftPanelView({
  header,
  details,
  status,
  series,
  lastChange,
}: ShiftPanelViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {header}
      {details.length > 0 ? (
        <dl
          className="dg-tabular-nums"
          style={{
            ...card,
            margin: 0,
            padding: "12px 16px",
            display: "grid",
            gridTemplateColumns: "96px minmax(0, 1fr)",
            rowGap: 8,
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          {details.map((detail) => (
            <div key={detail.label} style={{ display: "contents" }}>
              <dt style={{ color: "var(--dg-color-text-subtle)" }}>{detail.label}</dt>
              <dd style={{ margin: 0, color: "var(--dg-color-text-primary)", fontWeight: 500 }}>
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {status ? <StatusCard status={status} /> : null}
      {series}
      {lastChange ? (
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-subtle)",
            padding: "0 2px",
          }}
        >
          {lastChange}
        </div>
      ) : null}
    </div>
  );
}
