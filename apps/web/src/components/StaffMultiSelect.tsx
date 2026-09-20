"use client";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/Button";
import { Popover, PopoverContent } from "@/components/ui/popover";

export interface StaffOption {
  id: string;
  name: string;
}

/**
 * A pick-many staff filter: the trigger reads like `CustomSelect`, the menu
 * holds a search box above a checklist, and the field stays open while
 * people are ticked so several can be chosen in one visit.
 */
export default function StaffMultiSelect({
  ariaLabel = "Staff",
  onChange,
  options,
  placeholder = "All staff",
  value,
}: {
  ariaLabel?: string;
  onChange: (ids: string[]) => void;
  options: StaffOption[];
  placeholder?: string;
  value: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  }, [options, query]);
  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.name ?? placeholder)
        : `${value.length} staff`;

  const toggle = (id: string) => {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div ref={ref} style={{ display: "inline-block", width: "100%" }}>
      <Button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          height: "var(--dg-toolbar-h)",
          background: "var(--dg-color-surface)",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-btn-radius)",
          padding: "0 10px 0 12px",
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 500,
          color: "var(--dg-type-control-color)",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          textAlign: "left",
          transition: "box-shadow 150ms ease",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
          borderColor: open ? "var(--dg-color-border-focus)" : "var(--dg-color-border)",
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          style={{
            color: "var(--dg-color-text-faint)",
            flexShrink: 0,
            transition: "transform 150ms ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Button>

      {open ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverContent
            anchor={ref}
            side="bottom"
            align="start"
            sideOffset={6}
            positionMethod="fixed"
            collisionPadding={12}
            collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
            initialFocus={false}
            className="dg-menu"
            style={{
              minWidth: "var(--anchor-width)",
              width: "max-content",
              maxWidth: "min(350px, 90vw)",
              maxHeight: "min(420px, var(--available-height, calc(100vh - 24px)))",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              overflow: "hidden",
            }}
          >
            <input
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              autoFocus
              className="dg-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              type="search"
              value={query}
            />
            <div role="listbox" aria-multiselectable style={{ overflowY: "auto", minHeight: 0 }}>
              {visible.length === 0 ? (
                <div
                  style={{
                    padding: "9px 14px",
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  No one matches
                </div>
              ) : (
                visible.map((option) => {
                  const isChecked = selected.has(option.id);
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={isChecked}
                      className="dg-menu-item"
                      onClick={() => toggle(option.id)}
                      style={{
                        width: "100%",
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: isChecked ? 600 : 500,
                        color: isChecked ? "var(--dg-color-text-primary)" : undefined,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          border: `1px solid ${isChecked ? "var(--dg-color-brand)" : "var(--dg-color-border)"}`,
                          background: isChecked ? "var(--dg-color-brand)" : "transparent",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isChecked ? (
                          <Check size={11} strokeWidth={3} color="var(--dg-color-text-inverse)" />
                        ) : null}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {option.name}
                      </span>
                    </Button>
                  );
                })
              )}
            </div>
            {value.length > 0 ? (
              <Button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={() => onChange([])}
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  padding: "6px 10px",
                  alignSelf: "flex-end",
                }}
              >
                Clear
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
