"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
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
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  useEffect(() => { setMounted(true); }, []);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const maxH = Math.max(spaceBelow, 160);
      setMenuStyle({
        position: "absolute",
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        minWidth: rect.width,
        width: "max-content",
        maxWidth: "min(350px, 90vw)",
        maxHeight: maxH,
        zIndex: 9999,
      });
    }
  }, [open]);

  // Reset focusedIndex when dropdown closes
  useEffect(() => {
    if (!open) setFocusedIndex(-1);
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
  }, [open]);

  const trigger = (
    <div ref={ref} style={{ display: "inline-block", verticalAlign: "middle", ...style }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
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
          borderRadius: 10,
          padding: "0 10px 0 12px",
          fontSize,
          fontWeight: 500,
          color: disabled ? "var(--color-text-subtle)" : "var(--color-text-secondary)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          textAlign: "left",
          transition: "box-shadow 150ms ease",
          boxShadow: open ? "0 0 0 3px rgba(56,189,248,0.15)" : undefined,
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
