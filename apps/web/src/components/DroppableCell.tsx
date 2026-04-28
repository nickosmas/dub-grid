"use client";

import React, { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { GridCellId } from "@/types";

export interface CellDropData {
  cellId: GridCellId;
}

interface DroppableCellProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  data: CellDropData;
  disabled?: boolean;
}

export default memo(function DroppableCell({
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
      data-drop-target={isOver && !disabled ? "true" : undefined}
      style={{
        ...style,
      }}
    >
      {children}
    </div>
  );
});
