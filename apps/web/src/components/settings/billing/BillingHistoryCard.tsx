"use client";

import { useState } from "react";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { SpanTabs } from "@/components/ui/span-tabs";
import { describeBillingEvent, type BillingEventCategory } from "@/features/billing/events";
import { tdStyle, thStyle } from "@/lib/styles";
import type { BillingOperationSummary } from "@/types";
import { EVEN_TABS, BillingCard, FooterNote, IconTile } from "./billing-ui";

type Filter = "all" | BillingEventCategory;

const FILTER_EMPTY: Record<Filter, string> = {
  all: "There's no billing activity yet. Changes to your trial, subscription, and payments will appear here.",
  payments: "There are no payments here yet.",
  subscription: "There are no subscription changes here yet.",
  trial: "There are no trial changes here yet.",
};

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

export function BillingHistoryCard({ operations }: { operations: BillingOperationSummary[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = operations
    .map((operation) => ({ operation, view: describeBillingEvent(operation) }))
    .filter(({ view }) => filter === "all" || view.category === filter);

  return (
    <BillingCard
      icon="receipt"
      title="Billing history"
      headingId="billing-history-heading"
      aside={
        <SpanTabs<Filter>
          aria-label="Show billing history for"
          className={EVEN_TABS}
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "All" },
            { value: "payments", label: "Payments" },
            { value: "subscription", label: "Subscription" },
            { value: "trial", label: "Trial" },
          ]}
        />
      }
      footer={
        <FooterNote>Invoices and receipts can be downloaded from the billing portal.</FooterNote>
      }
    >
      {rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: 20,
            fontSize: "var(--dg-fs-label)",
            color: "var(--dg-color-text-muted)",
          }}
        >
          {FILTER_EMPTY[filter]}
        </p>
      ) : (
        <>
          <ul className="sm:hidden" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map(({ operation, view }, index) => (
              <li
                key={operation.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "12px 16px",
                  borderTop: index === 0 ? "none" : "1px solid var(--dg-color-border-light)",
                }}
              >
                <IconTile icon={view.icon} tone={view.tone} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--dg-fs-label)" }}>
                      {view.title}
                    </span>
                    {view.amount && (
                      <span
                        className="dg-tabular-nums"
                        style={{
                          fontWeight: 600,
                          fontSize: "var(--dg-fs-label)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {view.amount}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--dg-color-text-muted)",
                      lineHeight: 1.45,
                    }}
                  >
                    {view.detail}
                  </div>
                  <div
                    className="dg-tabular-nums"
                    style={{
                      marginTop: 4,
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    {operation.actorLabel} · {formatEventDate(operation.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div
            className="hidden sm:block"
            data-settings-table-layout="distributed"
            style={{ width: "100%", overflowX: "auto" }}
          >
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, paddingLeft: 20 }}>Event</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                  <th style={thStyle}>By</th>
                  <th style={{ ...thStyle, textAlign: "right", paddingRight: 20 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ operation, view }, index) => {
                  const cell = { ...tdStyle, borderTop: index === 0 ? "none" : tdStyle.borderTop };
                  return (
                    <tr key={operation.id}>
                      <td style={{ ...cell, paddingLeft: 20 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <IconTile icon={view.icon} tone={view.tone} size={30} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{view.title}</div>
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: "var(--dg-fs-caption)",
                                color: "var(--dg-color-text-muted)",
                                lineHeight: 1.45,
                              }}
                            >
                              {view.detail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        className="dg-tabular-nums"
                        style={{
                          ...cell,
                          textAlign: "right",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {view.amount ?? ""}
                      </td>
                      <td
                        style={{
                          ...cell,
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {operation.actorLabel}
                      </td>
                      <td
                        className="dg-tabular-nums"
                        style={{
                          ...cell,
                          textAlign: "right",
                          paddingRight: 20,
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Hint content={hint(formatEventTime(operation.createdAt))}>
                          <span>{formatEventDate(operation.createdAt)}</span>
                        </Hint>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </BillingCard>
  );
}
