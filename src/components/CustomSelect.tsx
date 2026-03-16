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
  fontSize?: number;
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
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setMounted(true);
  }, []);

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
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: disabled ? "var(--color-bg)" : "#fff",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "7px 10px 7px 12px",
          fontSize,
          fontWeight: 500,
          color: disabled ? "var(--color-text-subtle)" : "var(--color-text-secondary)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          textAlign: "left",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          boxShadow: open ? "0 0 0 3px rgba(56,189,248,0.15)" : undefined,
          borderColor: open ? "var(--color-border-focus)" : "var(--color-border)",
          opacity: disabled ? 0.7 : 1,
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
      style={{
        ...menuStyle,
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
        overflowY: "auto",
        overflowX: "hidden",
        padding: "4px 0",
      }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => { onChange(opt.value); setOpen(false); }}
            style={{
              display: "block",
              width: "calc(100% - 8px)",
              margin: "2px 4px",
              textAlign: "left",
              padding: "8px 12px",
              fontSize,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: isActive ? "var(--color-border-light)" : "transparent",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "normal",
              wordBreak: "break-word",
              transition: "background 100ms ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--color-surface-overlay)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
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
