import type { ReactNode } from "react";
import { Tag } from "lucide-react";
import type { BillingOverview, BillingTimelineStep } from "@/features/billing/overview";
import {
  BillingCard,
  FooterNote,
  IconTile,
  ProgressRing,
  StatusBadge,
  toneColors,
} from "./billing-ui";

const DOT = 14;

function Timeline({ steps }: { steps: BillingTimelineStep[] }) {
  if (steps.length < 2) return null;
  const span = steps.length - 1;
  const reached = steps.reduce(
    (last, step, index) => (step.state === "upcoming" ? last : index),
    0,
  );
  // Dots sit evenly from the first edge to the last, so the line spans the card.
  const at = (index: number) => `calc(${(index / span) * 100}% - ${(index / span) * DOT}px)`;
  return (
    <div style={{ position: "relative", margin: "22px 0 0" }}>
      <div aria-hidden="true" style={{ position: "relative", height: DOT }}>
        <span
          style={{
            position: "absolute",
            top: DOT / 2 - 1,
            left: DOT / 2,
            right: DOT / 2,
            height: 2,
            background: "var(--dg-color-border)",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: DOT / 2 - 1,
            left: DOT / 2,
            width: `calc((100% - ${DOT}px) * ${reached / span})`,
            height: 2,
            background: "var(--dg-color-primary)",
          }}
        />
        {steps.map((step, index) => {
          const dotColor = step.alert ? "var(--dg-color-danger)" : "var(--dg-color-primary)";
          const done = step.state === "done";
          return (
            <span
              key={step.key}
              style={{
                position: "absolute",
                top: 0,
                left: at(index),
                width: DOT,
                height: DOT,
                borderRadius: "50%",
                boxSizing: "border-box",
                background: done ? dotColor : "var(--dg-color-surface)",
                border: `2px solid ${
                  done || step.state === "now" || step.alert
                    ? dotColor
                    : "var(--dg-color-border-strong)"
                }`,
                boxShadow:
                  step.state === "now" ? "0 0 0 4px var(--dg-color-primary-bg)" : undefined,
              }}
            />
          );
        })}
      </div>
      <ol
        aria-label="Billing timeline"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          gap: 8,
          listStyle: "none",
          margin: "8px 0 0",
          padding: 0,
        }}
      >
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === "now" ? "step" : undefined}
            style={{
              minWidth: 0,
              textAlign: index === 0 ? "left" : index === span ? "right" : "center",
            }}
          >
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                color: step.alert ? "var(--dg-color-danger-text)" : "var(--dg-color-text-primary)",
              }}
            >
              {step.label}
            </div>
            <div
              className="dg-tabular-nums"
              style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}
            >
              {step.when}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BillingOverviewCard({
  overview,
  footerNote,
  actions,
}: {
  overview: BillingOverview;
  footerNote: string;
  actions: ReactNode;
}) {
  const { visual } = overview;
  return (
    <BillingCard
      icon="card"
      title="DubGrid subscription"
      headingId="billing-subscription-heading"
      aside={<StatusBadge label={overview.status.label} tone={overview.status.tone} />}
      footer={
        <>
          <FooterNote>{footerNote}</FooterNote>
          {actions}
        </>
      }
    >
      <div style={{ padding: 20 }}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
          {visual.kind === "ring" ? (
            <ProgressRing
              value={String(visual.value)}
              unit={visual.unit}
              caption={visual.caption}
              fraction={visual.total > 0 ? visual.value / visual.total : 0}
              color={toneColors(visual.tone).text}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                width: 128,
                flexShrink: 0,
              }}
            >
              <span style={{ padding: "12px 0" }}>
                <IconTile icon={visual.icon} tone={visual.tone} size={96} />
              </span>
              <span
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 500,
                  color: "var(--dg-color-text-muted)",
                  textAlign: "center",
                }}
              >
                {visual.caption}
              </span>
            </div>
          )}
          <div className="w-full min-w-0 text-center sm:flex-1 sm:text-left">
            <h2
              style={{
                margin: 0,
                fontSize: "var(--dg-fs-card-title)",
                fontWeight: 700,
                lineHeight: 1.35,
                color: "var(--dg-color-text-primary)",
              }}
            >
              {overview.title}
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "var(--dg-fs-body-sm)",
                lineHeight: 1.5,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              {overview.lead}
            </p>
            <p
              className="justify-center sm:justify-start"
              style={{
                margin: "10px 0 0",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              <Tag size={13} aria-hidden="true" />
              DubGrid is billed monthly for each seat.
            </p>
          </div>
        </div>
        <Timeline steps={overview.timeline} />
      </div>
    </BillingCard>
  );
}
