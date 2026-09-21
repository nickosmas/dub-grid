import { useState, useMemo } from "react";
import Link from "next/link";
import type { ActivityItem } from "@/lib/dashboard-stats";
import { ActivityIcon } from "../ActivityIcon";
import { Button } from "@/components/Button";
import Modal from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "publish", label: "Published" },
  { value: "request", label: "Requests" },
  { value: "user_signup", label: "User sign-ups" },
] as const;

interface ExpandedActivityProps {
  items: ActivityItem[];
  onClose: () => void;
}

export default function ExpandedActivity({ items, onClose }: ExpandedActivityProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (typeFilter === "all" ? items : items.filter((item) => item.type === typeFilter)),
    [items, typeFilter],
  );

  return (
    <Modal title="Recent activity" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Type filter tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            padding: 16,
            borderRadius: "var(--dg-radius-md)",
            background: "var(--dg-color-bg)",
            border: "1px solid var(--dg-color-border)",
          }}
        >
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.value;
            return (
              <Button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                style={{
                  fontSize: "var(--dg-type-control-size)",
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: "var(--dg-radius-sm)",
                  border: "1px solid",
                  borderColor: active ? "var(--dg-color-brand)" : "var(--dg-color-border)",
                  background: active ? "var(--dg-color-brand)" : "transparent",
                  color: active ? "var(--dg-color-text-inverse)" : "var(--dg-color-text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {f.label}
              </Button>
            );
          })}
          <span
            style={{
              fontSize: "var(--dg-type-metadata-size)",
              color: "var(--dg-color-text-subtle)",
              marginLeft: "auto",
              alignSelf: "center",
            }}
          >
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Feed list */}
        <div
          style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column" }}
        >
          {filtered.length === 0 ? (
            <EmptyState size="compact" heading="No activity matching filter" />
          ) : (
            filtered.map((item, i) => (
              <Link
                key={item.id}
                href={item.href}
                style={{ display: "block", textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom:
                      i < filtered.length - 1 ? "1px solid var(--dg-color-border-light)" : "none",
                  }}
                >
                  <ActivityIcon kind={item.iconKind} variant={item.iconVariant} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--dg-color-text-secondary)",
                        lineHeight: 1.35,
                      }}
                    >
                      {item.description}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--dg-type-metadata-size)",
                        color: "var(--dg-color-text-subtle)",
                        marginTop: 3,
                      }}
                    >
                      {item.relativeTime}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };
