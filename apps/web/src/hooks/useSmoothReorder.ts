"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  clampDragDelta,
  computeAutoScrollStep,
  computeDropIndex,
  computeSlotSize,
  computeTargetDelta,
  type ReorderLayout,
} from "./reorder-geometry";

type ItemId = number | string;

/**
 * - `dragging`: the dragged item follows the pointer; the others give way.
 * - `snap`: the frame after a drop. The new order is already rendered, so
 *   every item jumps without a transition to where it already appears.
 * - `settling`: the dragged item glides into its slot.
 */
type DragPhase = "dragging" | "snap" | "settling";

/** Pixels the pointer moves before the list starts scrolling, so grabbing near an edge doesn't. */
const AUTOSCROLL_ARM_PX = 4;

interface Scroller {
  top: () => number;
  scrollBy: (deltaY: number) => void;
  visible: () => [number, number];
}

interface DragSession {
  pointerId: number;
  handle: HTMLElement;
  ids: ItemId[];
  sourceIdx: number;
  layout: ReorderLayout;
  startClientY: number;
  clientY: number;
  startOffset: number;
  startScroll: number;
  scroller: Scroller;
  offset: number;
  dropIdx: number;
  armed: boolean;
  frame: number | null;
  lastTime: number | null;
}

interface MotionState {
  draggedId: ItemId;
  ids: ItemId[];
  phase: DragPhase;
  sourceIdx: number;
  dropIdx: number;
  slot: number;
  /** On a cancel the others glide back instead of snapping. */
  neighboursGlide: boolean;
}

export interface ReorderHandleProps {
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLElement>) => void;
  onLostPointerCapture?: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

interface UseSmoothReorderOptions<T> {
  items: T[];
  enabled: boolean;
  getId: (item: T) => ItemId;
  onReorder: (sourceIdx: number, dropIdx: number) => void;
  /** The CSS custom property each item reads its offset from. */
  offsetProperty?: string;
  /** Matches the item's CSS transform transition. */
  settleMs?: number;
}

function findScroller(node: HTMLElement): Scroller {
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = window.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 1) {
      const element = el;
      return {
        top: () => element.scrollTop,
        scrollBy: (deltaY) => {
          element.scrollTop += deltaY;
        },
        visible: () => {
          const rect = element.getBoundingClientRect();
          return [Math.max(0, rect.top), Math.min(window.innerHeight, rect.bottom)];
        },
      };
    }
  }
  return {
    top: () => window.scrollY,
    scrollBy: (deltaY) => window.scrollBy(0, deltaY),
    visible: () => [0, window.innerHeight],
  };
}

/** The item's current translateY, mid-transition included. */
function currentTranslateY(node: HTMLElement): number {
  const { transform } = window.getComputedStyle(node);
  if (!transform || transform === "none" || typeof DOMMatrixReadOnly === "undefined") return 0;
  try {
    return new DOMMatrixReadOnly(transform).m42;
  } catch {
    return 0;
  }
}

/**
 * Pointer and keyboard reordering for a vertical list. The dragged item moves
 * through a CSS custom property written straight to its node, so a long list
 * does not re-render every frame; React renders only when the drop slot
 * changes. The new order is committed on drop, before the settle animation,
 * so grabbing again straight away can never lose the previous move.
 */
export function useSmoothReorder<T>({
  items,
  enabled,
  getId,
  onReorder,
  offsetProperty = "--dg-settings-reorder-offset",
  settleMs = 190,
}: UseSmoothReorderOptions<T>) {
  const nodeRefs = useRef(new Map<ItemId, HTMLElement>());
  const sessionRef = useRef<DragSession | null>(null);
  const offsetRef = useRef(0);
  const settleTimeoutRef = useRef<number | null>(null);
  const [motion, setMotion] = useState<MotionState | null>(null);
  const motionRef = useRef<MotionState | null>(null);
  motionRef.current = motion;

  const ids = useMemo(() => items.map(getId), [getId, items]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const writeOffset = useCallback(
    (id: ItemId, value: number) => {
      nodeRefs.current.get(id)?.style.setProperty(offsetProperty, `${value}px`);
    },
    [offsetProperty],
  );

  const setDraggedOffset = useCallback(
    (id: ItemId, value: number) => {
      offsetRef.current = value;
      writeOffset(id, value);
    },
    [writeOffset],
  );

  const clearSettleTimeout = useCallback(() => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  const removeWindowListenersRef = useRef<(() => void) | null>(null);

  const stopSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    removeWindowListenersRef.current?.();
    removeWindowListenersRef.current = null;
    if (!session) return null;
    if (session.frame !== null) window.cancelAnimationFrame(session.frame);
    if (session.handle.hasPointerCapture?.(session.pointerId)) {
      session.handle.releasePointerCapture(session.pointerId);
    }
    return session;
  }, []);

  const hardReset = useCallback(() => {
    stopSession();
    clearSettleTimeout();
    const current = motionRef.current;
    if (current) setDraggedOffset(current.draggedId, 0);
    offsetRef.current = 0;
    setMotion(null);
  }, [clearSettleTimeout, setDraggedOffset, stopSession]);

  const finishDrag = useCallback(
    (commit: boolean) => {
      const session = stopSession();
      if (!session) return;
      const draggedId = session.ids[session.sourceIdx];
      const moved = commit && session.dropIdx !== session.sourceIdx;
      const target = moved
        ? computeTargetDelta(session.layout, session.sourceIdx, session.dropIdx)
        : 0;

      setDraggedOffset(draggedId, session.offset - target);
      if (moved) onReorderRef.current(session.sourceIdx, session.dropIdx);
      setMotion((current) =>
        current ? { ...current, phase: "snap", neighboursGlide: !moved } : current,
      );
    },
    [setDraggedOffset, stopSession],
  );

  const finishDragRef = useRef(finishDrag);
  finishDragRef.current = finishDrag;

  // The snap frame is committed; force a style pass so the browser has seen
  // it, then start the glide in the same frame. Waiting a frame instead would
  // paint the snapped position once and visibly hitch.
  useLayoutEffect(() => {
    if (motion?.phase !== "snap") return;
    void nodeRefs.current.get(motion.draggedId)?.getBoundingClientRect();
    offsetRef.current = 0;
    setMotion({ ...motion, phase: "settling" });
    clearSettleTimeout();
    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null;
      setMotion(null);
    }, settleMs);
  }, [clearSettleTimeout, motion, settleMs]);

  useEffect(() => hardReset, [hardReset]);

  useEffect(() => {
    if (!enabled) hardReset();
  }, [enabled, hardReset]);

  // Someone else changed the list mid-drag (a realtime update, a save): the
  // measured layout no longer describes it, so let go rather than drop wrong.
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.ids.length !== ids.length || session.ids.some((id, i) => id !== ids[i])) {
      hardReset();
    }
  }, [hardReset, ids]);

  const updateFromPointer = useCallback(
    (session: DragSession) => {
      const raw =
        session.startOffset +
        (session.clientY - session.startClientY) +
        (session.scroller.top() - session.startScroll);
      const offset = clampDragDelta(session.layout, session.sourceIdx, raw);
      if (offset !== session.offset) {
        session.offset = offset;
        setDraggedOffset(session.ids[session.sourceIdx], offset);
      }
      const dropIdx = computeDropIndex(session.layout, session.sourceIdx, offset);
      if (dropIdx !== session.dropIdx) {
        session.dropIdx = dropIdx;
        setMotion((current) =>
          current && current.phase === "dragging" ? { ...current, dropIdx } : current,
        );
      }
    },
    [setDraggedOffset],
  );

  const tick = useCallback(
    (time: number) => {
      const session = sessionRef.current;
      if (!session) return;
      const elapsed = session.lastTime === null ? 16 : Math.min(48, time - session.lastTime);
      session.lastTime = time;
      if (session.armed) {
        const [visibleTop, visibleBottom] = session.scroller.visible();
        const step = computeAutoScrollStep(session.clientY, visibleTop, visibleBottom);
        if (step !== 0) session.scroller.scrollBy(Math.round((step * elapsed) / 16));
      }
      updateFromPointer(session);
      session.frame = window.requestAnimationFrame(tick);
    },
    [updateFromPointer],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, index: number) => {
      if (!enabled || event.button !== 0 || sessionRef.current) return;
      const currentIds = idsRef.current;
      const draggedId = currentIds[index];
      if (draggedId === undefined) return;

      const nodes = currentIds.map((id) => nodeRefs.current.get(id));
      if (nodes.some((node) => !node)) return;

      // Measured now, not on render: the page may have scrolled since, and
      // an item still settling from the last drop is mid-transform.
      const translates = (nodes as HTMLElement[]).map(currentTranslateY);
      const rects = (nodes as HTMLElement[]).map((node) => node.getBoundingClientRect());
      const layout: ReorderLayout = {
        tops: rects.map((rect, i) => rect.top - translates[i]),
        heights: rects.map((rect) => rect.height),
      };

      event.preventDefault();
      event.stopPropagation();
      clearSettleTimeout();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      const scroller = findScroller(nodes[index] as HTMLElement);
      const startOffset = translates[index];
      const session: DragSession = {
        pointerId: event.pointerId,
        handle: event.currentTarget,
        ids: currentIds,
        sourceIdx: index,
        layout,
        startClientY: event.clientY,
        clientY: event.clientY,
        startOffset,
        startScroll: scroller.top(),
        scroller,
        offset: startOffset,
        dropIdx: index,
        armed: false,
        frame: null,
        lastTime: null,
      };
      sessionRef.current = session;

      // Other items may still be gliding from the previous drop.
      for (const id of currentIds) if (id !== draggedId) writeOffset(id, 0);
      setDraggedOffset(draggedId, startOffset);
      setMotion({
        draggedId,
        ids: currentIds,
        phase: "dragging",
        sourceIdx: index,
        dropIdx: index,
        slot: computeSlotSize(layout, index),
        neighboursGlide: false,
      });

      const onKey = (keyEvent: globalThis.KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          // Escape cancels the drag only; a surrounding dialog stays open.
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          finishDragRef.current(false);
        }
      };
      const onBlur = () => finishDragRef.current(false);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", onBlur);
      removeWindowListenersRef.current = () => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("blur", onBlur);
      };

      session.frame = window.requestAnimationFrame(tick);
    },
    [clearSettleTimeout, enabled, setDraggedOffset, tick, writeOffset],
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    session.clientY = event.clientY;
    if (Math.abs(event.clientY - session.startClientY) > AUTOSCROLL_ARM_PX) session.armed = true;
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      session.clientY = event.clientY;
      updateFromPointer(session);
      finishDrag(true);
    },
    [finishDrag, updateFromPointer],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      finishDrag(false);
    },
    [finishDrag],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      if (!enabled || sessionRef.current) return;
      const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (direction === 0) return;
      event.preventDefault();
      event.stopPropagation();

      const nextIndex = index + direction;
      const id = idsRef.current[index];
      if (id === undefined || nextIndex < 0 || nextIndex >= idsRef.current.length) return;
      onReorder(index, nextIndex);
      // Keep the moved item, and the focus that moved with it, on screen.
      window.requestAnimationFrame(() => {
        nodeRefs.current.get(id)?.scrollIntoView?.({ block: "nearest" });
      });
    },
    [enabled, onReorder],
  );

  const indexById = useMemo(
    () => new Map((motion?.ids ?? []).map((id, index) => [id, index])),
    [motion?.ids],
  );

  const getItemMotion = useCallback(
    (item: T) => {
      const id = getId(item);
      if (!motion) {
        return { offsetY: 0, isDragging: false, isMoving: false, dragPhase: null };
      }
      if (id === motion.draggedId) {
        return {
          offsetY: offsetRef.current,
          isDragging: true,
          isMoving: false,
          dragPhase: motion.phase,
        };
      }
      if (motion.phase === "snap") {
        return {
          offsetY: 0,
          isDragging: false,
          isMoving: false,
          dragPhase: motion.neighboursGlide ? null : ("snap" as const),
        };
      }
      if (motion.phase !== "dragging") {
        return { offsetY: 0, isDragging: false, isMoving: false, dragPhase: null };
      }

      const index = indexById.get(id);
      const { sourceIdx, dropIdx, slot } = motion;
      let offsetY = 0;
      if (index !== undefined) {
        if (sourceIdx < dropIdx && index > sourceIdx && index <= dropIdx) offsetY = -slot;
        if (dropIdx < sourceIdx && index >= dropIdx && index < sourceIdx) offsetY = slot;
      }
      return { offsetY, isDragging: false, isMoving: offsetY !== 0, dragPhase: null };
    },
    [getId, indexById, motion],
  );

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

  const getHandleProps = useCallback(
    (index: number): ReorderHandleProps =>
      enabled
        ? {
            onPointerDown: (event) => handlePointerDown(event, index),
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerCancel,
            onLostPointerCapture: handlePointerCancel,
            onKeyDown: (event) => handleKeyDown(event, index),
          }
        : {},
    [
      enabled,
      handleKeyDown,
      handlePointerCancel,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
    ],
  );

  return {
    setItemNode,
    getItemMotion,
    getHandleProps,
    isDragging: motion !== null && motion.phase === "dragging",
  };
}
