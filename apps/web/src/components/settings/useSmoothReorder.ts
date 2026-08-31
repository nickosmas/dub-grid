"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";

const SETTLE_MS = 190;

interface DragSession {
  pointerId: number;
  draggedIdx: number;
  startY: number;
  dropIdx: number;
  centers: number[];
}

interface UseSmoothReorderOptions<T> {
  items: T[];
  enabled: boolean;
  getId: (item: T) => number | string;
  onReorder: (sourceIdx: number, dropIdx: number) => void;
  fallbackHeight?: number;
}

export function useSmoothReorder<T>({
  items,
  enabled,
  getId,
  onReorder,
  fallbackHeight = 48,
}: UseSmoothReorderOptions<T>) {
  const nodeRefs = useRef(new Map<number | string, HTMLElement>());
  const rectRefs = useRef(new Map<number | string, DOMRect>());
  const dragFrameRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const queuedDeltaRef = useRef(0);
  const sessionRef = useRef<DragSession | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [dragPhase, setDragPhase] = useState<"dragging" | "settling" | null>(null);

  useLayoutEffect(() => {
    const nextRects = new Map<number | string, DOMRect>();

    for (const item of items) {
      const id = getId(item);
      const node = nodeRefs.current.get(id);
      if (node) {
        nextRects.set(id, node.getBoundingClientRect());
      }
    }

    rectRefs.current = nextRects;
  }, [getId, items]);

  const setItemNode = useCallback(
    (item: T, node: HTMLElement | null) => {
      const id = getId(item);
      if (node) {
        nodeRefs.current.set(id, node);
        return;
      }

      nodeRefs.current.delete(id);
    },
    [getId],
  );

  const cancelDragFrame = useCallback(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, []);

  const cancelSettleTimeout = useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  const resetDrag = useCallback(() => {
    sessionRef.current = null;
    cancelDragFrame();
    cancelSettleTimeout();
    queuedDeltaRef.current = 0;
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDragDeltaY(0);
    setDragPhase(null);
  }, [cancelDragFrame, cancelSettleTimeout]);

  useEffect(() => resetDrag, [resetDrag]);

  useEffect(() => {
    if (!enabled) {
      resetDrag();
    }
  }, [enabled, resetDrag]);

  const getItemHeight = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return fallbackHeight;
      return rectRefs.current.get(getId(item))?.height ?? fallbackHeight;
    },
    [fallbackHeight, getId, items],
  );

  const getTargetDelta = useCallback(
    (sourceIdx: number, dropIdx: number) => {
      if (sourceIdx === dropIdx) return 0;

      let targetDelta = 0;
      if (sourceIdx < dropIdx) {
        for (let index = sourceIdx + 1; index <= dropIdx; index += 1) {
          targetDelta += getItemHeight(index);
        }
        return targetDelta;
      }

      for (let index = dropIdx; index < sourceIdx; index += 1) {
        targetDelta -= getItemHeight(index);
      }
      return targetDelta;
    },
    [getItemHeight],
  );

  const scheduleDelta = useCallback((deltaY: number) => {
    queuedDeltaRef.current = deltaY;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragDeltaY(queuedDeltaRef.current);
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, index: number) => {
      if (!enabled || event.button !== 0 || !items[index]) return;

      const centers = items.map((item) => {
        const id = getId(item);
        const rect = rectRefs.current.get(id) ?? nodeRefs.current.get(id)?.getBoundingClientRect();

        return rect ? rect.top + rect.height / 2 : null;
      });

      if (centers.some((center) => center === null)) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      cancelDragFrame();
      cancelSettleTimeout();
      queuedDeltaRef.current = 0;
      setDragDeltaY(0);
      setDraggedIdx(index);
      setDragOverIdx(index);
      setDragPhase("dragging");

      sessionRef.current = {
        pointerId: event.pointerId,
        draggedIdx: index,
        startY: event.clientY,
        dropIdx: index,
        centers: centers as number[],
      };
    },
    [cancelDragFrame, cancelSettleTimeout, enabled, getId, items],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();

      const deltaY = event.clientY - session.startY;
      const draggedCenter = session.centers[session.draggedIdx] + deltaY;
      let nextDropIdx = 0;

      for (let index = 0; index < session.centers.length; index += 1) {
        if (index !== session.draggedIdx && draggedCenter > session.centers[index]) {
          nextDropIdx += 1;
        }
      }

      session.dropIdx = nextDropIdx;
      setDragOverIdx((current) => (current === nextDropIdx ? current : nextDropIdx));
      scheduleDelta(deltaY);
    },
    [scheduleDelta],
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      sessionRef.current = null;
      cancelDragFrame();

      const currentDelta = queuedDeltaRef.current;
      const targetDelta = getTargetDelta(session.draggedIdx, session.dropIdx);
      setDragDeltaY(currentDelta);

      window.requestAnimationFrame(() => {
        setDragPhase("settling");
        setDragDeltaY(targetDelta);
      });

      settleTimeoutRef.current = window.setTimeout(() => {
        settleTimeoutRef.current = null;
        setDraggedIdx(null);
        setDragOverIdx(null);
        setDragPhase(null);
        setDragDeltaY(0);
        queuedDeltaRef.current = 0;
        onReorder(session.draggedIdx, session.dropIdx);
      }, SETTLE_MS);
    },
    [cancelDragFrame, getTargetDelta, onReorder],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      resetDrag();
    },
    [resetDrag],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      if (!enabled || !items[index]) return;

      const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (direction === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const nextIndex = index + direction;
      if (nextIndex >= 0 && nextIndex < items.length) {
        onReorder(index, nextIndex);
      }
    },
    [enabled, items, onReorder],
  );

  const offsets = useMemo(() => {
    const nextOffsets = new Map<number | string, number>();
    if (!enabled || draggedIdx === null || dragOverIdx === null) {
      return nextOffsets;
    }

    const draggedItem = items[draggedIdx];
    if (!draggedItem) return nextOffsets;

    const draggedId = getId(draggedItem);
    const draggedHeight = getItemHeight(draggedIdx);
    nextOffsets.set(draggedId, dragDeltaY);

    if (draggedIdx < dragOverIdx) {
      for (let index = draggedIdx + 1; index <= dragOverIdx; index += 1) {
        const item = items[index];
        if (item) {
          nextOffsets.set(getId(item), -draggedHeight);
        }
      }
      return nextOffsets;
    }

    for (let index = dragOverIdx; index < draggedIdx; index += 1) {
      const item = items[index];
      if (item) {
        nextOffsets.set(getId(item), draggedHeight);
      }
    }

    return nextOffsets;
  }, [dragDeltaY, dragOverIdx, draggedIdx, enabled, getId, getItemHeight, items]);

  const getItemMotion = useCallback(
    (item: T) => {
      const id = getId(item);
      const dragging =
        draggedIdx !== null && items[draggedIdx] !== undefined && getId(items[draggedIdx]) === id;

      return {
        offsetY: offsets.get(id) ?? 0,
        isDragging: dragging,
        isMoving: !dragging && offsets.has(id),
        dragPhase: dragging ? dragPhase : null,
      };
    },
    [dragPhase, draggedIdx, getId, items, offsets],
  );

  const getHandleProps = useCallback(
    (index: number) => ({
      onPointerDown: enabled
        ? (event: PointerEvent<HTMLElement>) => handlePointerDown(event, index)
        : undefined,
      onPointerMove: enabled ? handlePointerMove : undefined,
      onPointerUp: enabled ? handlePointerEnd : undefined,
      onPointerCancel: enabled ? handlePointerCancel : undefined,
      onKeyDown: enabled
        ? (event: KeyboardEvent<HTMLElement>) => handleKeyDown(event, index)
        : undefined,
    }),
    [
      enabled,
      handleKeyDown,
      handlePointerCancel,
      handlePointerDown,
      handlePointerEnd,
      handlePointerMove,
    ],
  );

  return {
    setItemNode,
    getItemMotion,
    getHandleProps,
    isDragging: draggedIdx !== null,
  };
}
