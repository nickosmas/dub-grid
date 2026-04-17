"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    () => buildTimezoneOptions({
      selectedTimeZone: value || null,
      detectedTimeZone: getBrowserTimezone(),
    }),
    [value],
  );
  const selectedOption = options.find((option) => option.value === value) ?? null;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mounted] = useState(typeof window !== "undefined");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.searchText.includes(query));
  }, [options, search]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const maxHeight = Math.max(spaceBelow, 220);

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.min(Math.max(rect.width, 340), window.innerWidth - 24),
      maxHeight,
      zIndex: 10100,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    setFocusedIndex(0);
    setSearch("");
  }, [open]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const triggerLabel = selectedOption?.triggerLabel ?? placeholder;

  const menu = open && mounted && !disabled
    ? createPortal(
        <div
          ref={menuRef}
          className="dg-menu"
          style={{
            ...menuStyle,
            padding: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 8,
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
                setFocusedIndex((prev) => Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0)));
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
          <div role="listbox" aria-label="Time zones" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
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
                  <button
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
                      background: isFocused ? "var(--color-bg-secondary)" : isSelected ? "var(--color-border-light)" : undefined,
                    }}
                  >
                    <span style={{ fontWeight: isSelected ? 700 : 600, color: "var(--color-text-primary)" }}>
                      {option.label}
                    </span>
                    <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
                      {option.value}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div ref={triggerRef} style={{ display: "inline-block", width: "100%", ...style }}>
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-disabled={disabled || undefined}
          onClick={() => !disabled && setOpen((prev) => !prev)}
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
        </button>
      </div>
      {menu}
    </>
  );
}
