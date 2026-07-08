"use client";

import React, { useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { GridCellId, ScheduleCellInput } from "@/types";

export interface ShiftDragData {
  cellId: GridCellId;
  label: string;
  payload: ScheduleCellInput;
  pillColor: string;
  pillText: string;
}

interface DraggableShiftProps {
  id: string;
  data: ShiftDragData;
  disabled?: boolean;
  children: React.ReactNode;
}

export default function DraggableShift({ id, data, disabled, children }: DraggableShiftProps) {
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
      ref={(el) => {
        setNodeRef(el);
        nodeRef.current = el;
      }}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      aria-roledescription="draggable schedule entry"
      aria-label={data.label}
      className={disabled ? undefined : "dg-draggable-shift"}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: "flex",
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? "scale(0.95)" : "none",
        transition: "opacity 150ms ease, transform 150ms ease",
        cursor: disabled ? undefined : "grab",
      }}
    >
      {children}
    </div>
  );
}
