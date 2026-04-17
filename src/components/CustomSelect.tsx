"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface CustomSelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Extra style on the trigger button */
  style?: React.CSSProperties;
  /** Font size override (default 13) */
  fontSize?: number | string;
}

export default function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  style,
  fontSize = 13,
}: CustomSelectProps<T>) {
  const [open, setOpenRaw] = useState(false);
  const [mounted] = useState(typeof window !== "undefined");
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
  const selected = useMemo(() => options.find((o) => o.value === value) ?? options[0], [options, value]);

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const maxH = Math.max(spaceBelow, 160);
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: rect.width,
      width: "max-content",
      maxWidth: "min(350px, 90vw)",
      maxHeight: maxH,
      zIndex: 10100,
    });
  }, []);

  useLayoutEffect(() => { if (open) updatePosition(); }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  // Focus menu when it opens
  useEffect(() => {
    if (open && menuRef.current) {
      menuRef.current.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  const trigger = (
    <div ref={ref} style={{ display: "inline-block", verticalAlign: "middle", ...style }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
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
          height: "var(--dg-toolbar-h)",
          background: disabled ? "var(--color-bg)" : "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--dg-btn-radius)",
          padding: "0 10px 0 12px",
          fontSize,
          fontWeight: 500,
          color: disabled ? "var(--color-text-subtle)" : "var(--color-text-secondary)",
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
          {selected?.label ?? "—"}
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
  );

  const menu = open && mounted && !disabled ? createPortal(
    <div
      ref={menuRef}
      role="listbox"
      tabIndex={-1}
      aria-label={`${selected?.label ?? "Select"} options`}
      aria-activedescendant={focusedIndex >= 0 ? `option-${String(options[focusedIndex]?.value)}` : undefined}
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
        ...menuStyle,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {options.map((opt, idx) => {
        const isActive = opt.value === value;
        const isFocused = idx === focusedIndex;
        return (
          <button
            key={String(opt.value)}
            id={`option-${String(opt.value)}`}
            type="button"
            role="option"
            aria-selected={isActive}
            className="dg-menu-item"
            onClick={() => { onChange(opt.value); setOpen(false); }}
            onMouseEnter={() => setFocusedIndex(idx)}
            style={{
              fontWeight: isActive ? 700 : undefined,
              color: isActive ? "var(--color-text-primary)" : undefined,
              background: isFocused ? "var(--color-bg-secondary)" : isActive ? "var(--color-border-light)" : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <>
      {trigger}
      {menu}
    </>
  );
}
