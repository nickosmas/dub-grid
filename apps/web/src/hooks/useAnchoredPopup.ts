import { useEffect, useState } from "react";

export type PopupCornerAlign = "start" | "end";
export interface PopupCornerPlacement {
  align: PopupCornerAlign;
  alignOffset: number;
  sideOffset: number;
}

interface CornerAlignOptions {
  popupWidth: number;
  viewportPadding?: number;
  cellInset?: number;
  overlapMin?: number;
  overlapMax?: number;
  overlapRatio?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getElementCornerPlacement(
  anchorEl: HTMLElement | null,
  {
    popupWidth,
    viewportPadding = 8,
    cellInset = 2,
    overlapMin = 6,
    overlapMax = 12,
    overlapRatio = 0.25,
  }: CornerAlignOptions,
): PopupCornerPlacement {
  if (!anchorEl || typeof window === "undefined") {
    return {
      align: "start",
      alignOffset: 0,
      sideOffset: 0,
    };
  }

  const rect = anchorEl.getBoundingClientRect();
  const overlap = clamp(rect.height * overlapRatio, overlapMin, overlapMax);
  const sideOffset = -overlap;
  const verticalDistanceToCenter = Math.max(0, rect.height / 2 - overlap);
  const cellMinX = rect.left + cellInset;
  const cellMaxX = rect.right - cellInset;
  const cellCenterX = rect.left + rect.width / 2;
  const startCornerX = clamp(cellCenterX + verticalDistanceToCenter, cellMinX, cellMaxX);
  const endCornerX = clamp(cellCenterX - verticalDistanceToCenter, cellMinX, cellMaxX);
  const maxStartCornerX = window.innerWidth - viewportPadding - popupWidth;
  const canFaceRight = startCornerX <= maxStartCornerX;

  if (canFaceRight) {
    return {
      align: "start",
      alignOffset: startCornerX - rect.left,
      sideOffset,
    };
  }

  return {
    align: "end",
    alignOffset: rect.right - endCornerX,
    sideOffset,
  };
}

export function getElementCornerAlign(
  anchorEl: HTMLElement | null,
  options: CornerAlignOptions,
): PopupCornerAlign {
  return getElementCornerPlacement(anchorEl, options).align;
}

export function usePopupCornerAlign(
  anchorEl: HTMLElement | null,
  fallbackWidth: number,
  viewportPadding = 8,
) {
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  const [popupWidth, setPopupWidth] = useState(fallbackWidth);

  useEffect(() => {
    if (!popupEl) return;

    const measure = () => {
      const nextWidth = popupEl.getBoundingClientRect().width;
      if (nextWidth > 0) {
        setPopupWidth(nextWidth);
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(popupEl);

    return () => {
      observer.disconnect();
    };
  }, [popupEl]);

  return {
    ...getElementCornerPlacement(anchorEl, {
      popupWidth,
      viewportPadding,
    }),
    popupRef: setPopupEl,
  };
}

export function useCloseOnWindowResize(onClose: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      onClose();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [onClose]);
}
