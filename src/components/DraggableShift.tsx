"use client";

import React, { useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";

export interface ShiftDragData {
  empId: string;
  date: Date;
  dateKey: string;
  label: string;
  shiftCodeIds: number[];
  focusAreaName: string;
  pillColor: string;
  pillText: string;
}

interface DraggableShiftProps {
  id: string;
  data: ShiftDragData;
  disabled?: boolean;
  children: React.ReactNode;
}

export default function DraggableShift({
  id,
  data,
  disabled,
  children,
}: DraggableShiftProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id,
    data,
    disabled,
  });

  // Track snap-back animation when drag ends
  const wasDragging = useRef(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (wasDragging.current && !isDragging && nodeRef.current) {
      nodeRef.current.classList.add("dg-snap-back");
      const timer = setTimeout(() => nodeRef.current?.classList.remove("dg-snap-back"), 200);
      return () => clearTimeout(timer);
    }
    wasDragging.current = isDragging;
  }, [isDragging]);

  return (
    <div
      ref={(el) => { setNodeRef(el); nodeRef.current = el; }}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      aria-roledescription="draggable shift"
      aria-label={data.label}
      className={disabled ? undefined : "dg-draggable-shift"}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? "scale(0.95)" : "none",
        transition: "opacity 150ms ease, transform 150ms ease",
        cursor: disabled ? undefined : "grab",
      }}
    >
      {/* Grip handle — visible on hover */}
      {!disabled && (
        <div
          className="dg-drag-grip"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 2,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            opacity: 0,
            transition: "opacity 150ms ease",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {/* 6-dot grip pattern */}
          {[0, 1, 2].map(r => (
            <div key={r} style={{ display: "flex", gap: 2 }}>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", opacity: 0.4 }} />
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", opacity: 0.4 }} />
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
