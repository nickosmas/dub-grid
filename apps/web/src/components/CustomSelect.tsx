"use client";
import { ChevronDown } from "lucide-react";

import { useState, useRef, useCallback, useMemo } from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/Button";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface CustomSelectProps<T extends string | number> {
  id?: string;
  ariaLabel?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  height?: React.CSSProperties["height"];
  /** Extra style on the wrapper, for how the control sits in its layout
   *  (width, flex). For the trigger's own chrome use `triggerStyle`. */
  style?: React.CSSProperties;
  /** Extra style on the trigger button itself: border, radius, padding. */
  triggerStyle?: React.CSSProperties;
  /** Font size override (default productive control size) */
  fontSize?: number | string;
  /** Font weight override (default productive control weight) */
  fontWeight?: React.CSSProperties["fontWeight"];
  /** Selected-option font weight override (default productive control weight) */
  activeFontWeight?: React.CSSProperties["fontWeight"];
  /** Letter spacing override */
  letterSpacing?: React.CSSProperties["letterSpacing"];
}

export default function CustomSelect<T extends string | number>({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  height,
  style,
  triggerStyle,
  fontSize = "var(--dg-type-control-size)",
  fontWeight = 500,
  activeFontWeight = 500,
  letterSpacing,
}: CustomSelectProps<T>) {
  const [open, setOpenRaw] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const setOpen = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setOpenRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (!next) setFocusedIndex(-1);
      return next;
    });
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  // Note: a `value` absent from `options` falls through to "—", which reads as
  // a broken control. Callers that filter their option list must narrow `value`
  // to match — see the schedule Toolbar's span select.
  const displayLabel = selected?.label ?? placeholder ?? "—";

  const setMenuRef = useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node;
      if (node && open) {
        node.focus({ preventScroll: true });
      }
    },
    [open],
  );

  const trigger = (
    <div ref={ref} style={{ display: "inline-block", verticalAlign: "middle", ...style }}>
      <Button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setFocusedIndex(0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setFocusedIndex(options.length - 1);
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          height: height ?? "var(--dg-toolbar-h)",
          background: disabled ? "var(--dg-color-bg)" : "var(--dg-color-surface)",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-btn-radius)",
          padding: "0 10px 0 12px",
          fontSize,
          fontWeight,
          letterSpacing,
          color: disabled ? "var(--dg-color-text-subtle)" : "var(--dg-type-control-color)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          textAlign: "left",
          transition: "box-shadow 150ms ease",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.15)" : undefined,
          borderColor: open ? "var(--dg-color-border-focus)" : "var(--dg-color-border)",
          opacity: disabled ? 0.5 : 1,
          ...triggerStyle,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {displayLabel}
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
    </div>
  );

  const menu =
    open && !disabled ? (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent
          anchor={ref}
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
          ref={setMenuRef}
          role="listbox"
          tabIndex={-1}
          aria-label={`${ariaLabel ?? displayLabel} options`}
          aria-activedescendant={
            focusedIndex >= 0 ? `option-${String(options[focusedIndex]?.value)}` : undefined
          }
          className="dg-menu"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setFocusedIndex((i) => (i + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setFocusedIndex((i) => (i - 1 + options.length) % options.length);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (focusedIndex >= 0 && focusedIndex < options.length) {
                onChange(options[focusedIndex].value);
                setOpen(false);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
          style={{
            minWidth: "var(--anchor-width)",
            width: "max-content",
            maxWidth: "min(350px, 90vw)",
            maxHeight: "min(420px, var(--available-height, calc(100vh - 24px)))",
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            scrollbarWidth: "none",
          }}
        >
          {options.map((opt, idx) => {
            const isActive = opt.value === value;
            const isFocused = idx === focusedIndex;
            return (
              <Button
                key={String(opt.value)}
                id={`option-${String(opt.value)}`}
                type="button"
                role="option"
                aria-selected={isActive}
                className="dg-menu-item"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setFocusedIndex(idx)}
                style={{
                  fontSize,
                  fontWeight: isActive ? activeFontWeight : fontWeight,
                  letterSpacing,
                  color: isActive ? "var(--dg-color-text-primary)" : undefined,
                  background: isFocused
                    ? "var(--dg-color-bg-secondary)"
                    : isActive
                      ? "var(--dg-color-border-light)"
                      : undefined,
                }}
              >
                {opt.label}
              </Button>
            );
          })}
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <>
      {trigger}
      {menu}
    </>
  );
}
