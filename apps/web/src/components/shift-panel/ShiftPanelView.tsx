"use client";

import type { ReactNode } from "react";
import type { ShiftChange } from "@dubgrid/schedule-core";
import { ShiftChangeCard } from "@/components/shift-change/ShiftChangeCard";

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

function StatusCard({ status }: { status: NonNullable<PanelViewStatus> }) {
  return (
    <div
      style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: "var(--dg-color-warning-text)",
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
            {status.kind === "unpublished" ? "Not published yet" : "Changed since it was published"}
          </div>
          {status.kind === "unpublished" ? (
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                marginTop: 2,
              }}
            >
              {status.personName} sees this once you publish.
            </div>
          ) : null}
        </div>
      </div>
      {status.kind === "changed" ? (
        <ShiftChangeCard change={status.change} layout="stacked" />
      ) : null}
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
