"use client";

import type { DraftBreakdown } from "@/lib/draft-utils";

interface DraftReviewSummaryProps {
  title: string;
  description?: string;
  breakdown: DraftBreakdown;
  emptyMessage?: string;
}

type BreakdownItem = {
  key: keyof DraftBreakdown;
  label: string;
  count: number;
};

function getBreakdownItems(breakdown: DraftBreakdown): BreakdownItem[] {
  const items: BreakdownItem[] = [
    { key: "newShifts", label: "New shifts", count: breakdown.newShifts },
    {
      key: "modifiedShifts",
      label: "Edited shifts",
      count: breakdown.modifiedShifts,
    },
    {
      key: "deletedShifts",
      label: "Deleted shifts",
      count: breakdown.deletedShifts,
    },
    { key: "newNotes", label: "New notes", count: breakdown.newNotes },
    {
      key: "deletedNotes",
      label: "Removed notes",
      count: breakdown.deletedNotes,
    },
  ];

  return items.filter((item) => item.count > 0);
}

export default function DraftReviewSummary({
  title,
  description,
  breakdown,
  emptyMessage = "No unpublished changes found.",
}: DraftReviewSummaryProps) {
  const items = getBreakdownItems(breakdown);

  return (
    <section
      aria-label={`${title} summary`}
      style={{
        border: "1px solid var(--dg-color-border)",
        borderRadius: 14,
        background: "var(--dg-color-bg)",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: description || items.length > 0 ? 10 : 0,
        }}
      >
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-body-sm)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {title}
          </h3>
          {description ? (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "var(--dg-fs-footnote)",
                lineHeight: 1.4,
                color: "var(--dg-color-text-subtle)",
              }}
            >
              {description}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "flex-end",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {breakdown.totalChanges}
          </span>
          <span
            style={{
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--dg-color-text-subtle)",
            }}
          >
            {breakdown.totalChanges === 1 ? "change" : "changes"}
          </span>
        </div>
      </div>

      {items.length > 0 ? (
        <dl
          style={{
            display: "grid",
            gap: 0,
            margin: 0,
            borderTop: "1px solid var(--dg-color-border-light)",
            paddingTop: 4,
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "9px 0",
                borderTop: index === 0 ? undefined : "1px solid var(--dg-color-border-light)",
              }}
            >
              <dt
                style={{
                  margin: 0,
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--dg-color-text-secondary)",
                }}
              >
                {item.label}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontSize: "var(--dg-fs-body-sm)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {item.count}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-footnote)",
            lineHeight: 1.5,
            color: "var(--dg-color-text-secondary)",
          }}
        >
          {emptyMessage}
        </p>
      )}
    </section>
  );
}
