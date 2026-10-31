"use client";

import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { MousePointer2 } from "lucide-react";

/** A generic desktop app window: traffic-light dots over the content. */
export function LandingWindow({
  children,
  className = "",
  stageRef,
}: {
  children: ReactNode;
  className?: string;
  stageRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={stageRef} className={`landing-window ${className}`}>
      <div className="landing-window-bar">
        <span />
        <span />
        <span />
      </div>
      {children}
    </div>
  );
}

interface Point {
  x: number;
  y: number;
}

/**
 * Where the element tagged `data-landing-target={target}` sits inside the
 * stage, measured from the stage's top-left corner, or null with no target.
 * `anchor` picks the point: the element's centre, or above its middle.
 */
export function useTargetPosition(
  stageRef: RefObject<HTMLElement | null>,
  target: string | null,
  anchor: "center" | "above" = "center",
): Point | null {
  const [point, setPoint] = useState<Point | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !target) {
      setPoint(null);
      return;
    }
    const measure = () => {
      const element = stage.querySelector<HTMLElement>(`[data-landing-target="${target}"]`);
      if (!element) return setPoint(null);
      const stageBox = stage.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      setPoint({
        x: box.left - stageBox.left + box.width / 2,
        y: anchor === "above" ? box.top - stageBox.top : box.top - stageBox.top + box.height / 2,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [anchor, stageRef, target]);

  return point;
}

/**
 * A pointer that glides to the tagged target. Without one it fades out where
 * it last was, so its next move starts from somewhere that makes sense; its
 * first move starts from the stage's bottom-right corner.
 */
export function LandingCursor({
  stageRef,
  target,
}: {
  stageRef: RefObject<HTMLElement | null>;
  target: string | null;
}) {
  const point = useTargetPosition(stageRef, target);
  const [rest, setRest] = useState<Point | null>(null);

  useLayoutEffect(() => {
    if (point) {
      setRest(point);
      return;
    }
    const stage = stageRef.current;
    if (stage && !rest) setRest({ x: stage.clientWidth - 24, y: stage.clientHeight - 16 });
  }, [point, rest, stageRef]);

  const shown = point ?? rest;

  return (
    <MousePointer2
      aria-hidden="true"
      className="landing-cursor"
      data-hidden={point ? undefined : true}
      style={shown ? { transform: `translate(${shown.x - 4}px, ${shown.y - 3}px)` } : undefined}
    />
  );
}
