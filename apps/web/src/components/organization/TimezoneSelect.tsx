"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/Button";
import { buildTimezoneOptions, getBrowserTimezone } from "@/lib/timezones";

interface TimezoneSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function TimezoneSelect({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Select a time zone…",
  style,
}: TimezoneSelectProps) {
  const options = useMemo(
    () =>
      buildTimezoneOptions({
        selectedTimeZone: value || null,
        detectedTimeZone: getBrowserTimezone(),
      }),
    [value],
  );
  const selectedOption = options.find((option) => option.value === value) ?? null;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.searchText.includes(query));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  const triggerLabel = selectedOption?.triggerLabel ?? placeholder;

  const menu =
    open && !disabled ? (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent
          anchor={triggerRef}
          side="bottom"
          align="start"
          sideOffset={6}
          positionMethod="fixed"
          collisionPadding={12}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          initialFocus={false}
          className="dg-menu"
          style={{
            padding: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "min(max(var(--anchor-width), 340px), calc(100vw - 24px))",
            maxHeight: "min(420px, var(--available-height, calc(100vh - 24px)))",
          }}
        >
          <input
            ref={searchRef}
            className="dg-input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setFocusedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setFocusedIndex((prev) =>
                  Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const option = filteredOptions[focusedIndex];
                if (option) {
                  onChange(option.value);
                  setOpen(false);
                }
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Search time zones…"
          />
          <div
            role="listbox"
            aria-label="Time zones"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--color-text-muted)",
                }}
              >
                No matching time zones
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isFocused = index === focusedIndex;

                return (
                  <Button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className="dg-menu-item"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setFocusedIndex(index)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 2,
                      background: isFocused
                        ? "var(--color-bg-secondary)"
                        : isSelected
                          ? "var(--color-border-light)"
                          : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: isSelected ? 700 : 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {option.label}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {option.value}
                    </span>
                  </Button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <>
      <div ref={triggerRef} style={{ display: "inline-block", width: "100%", ...style }}>
        <Button
          id={id}
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (disabled) return;
            setOpen((prev) => {
              const next = !prev;
              if (next) {
                setFocusedIndex(0);
                setSearch("");
              }
              return next;
            });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            height: "var(--dg-toolbar-h)",
            background: disabled ? "var(--color-bg)" : "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--dg-btn-radius)",
            padding: "0 10px 0 12px",
            fontSize: 13,
            fontWeight: 500,
            color: selectedOption ? "var(--color-text-secondary)" : "var(--color-text-subtle)",
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            textAlign: "left",
            transition: "box-shadow 150ms ease",
            boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
            borderColor: open ? "var(--color-border-focus)" : "var(--color-border)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {triggerLabel}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: "var(--color-text-faint)",
              flexShrink: 0,
              transition: "transform 150ms ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </Button>
      </div>
      {menu}
    </>
  );
}
