"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";

export interface CellDropData {
  empId: string;
  date: Date;
  dateKey: string;
  focusAreaName: string;
}

interface DroppableCellProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  data: CellDropData;
  disabled?: boolean;
}

export default function DroppableCell({
  id,
  data,
  disabled,
  children,
  style,
  ...divProps
}: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled });

  return (
    <div
      ref={setNodeRef}
      {...divProps}
      aria-label={`Drop zone for ${data.focusAreaName}, ${data.dateKey}`}
      style={{
        ...style,
        ...(isOver && !disabled
          ? {
              outline: "2px solid var(--color-primary)",
              outlineOffset: -2,
            }
          : undefined),
      }}
    >
      {children}
    </div>
  );
}
