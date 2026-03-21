"use client";

import React from "react";
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

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      aria-roledescription="draggable shift"
      aria-label={data.label}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? "scale(0.95)" : "none",
        transition: "opacity 150ms ease, transform 150ms ease",
        cursor: disabled ? undefined : "grab",
      }}
    >
      {children}
    </div>
  );
}
