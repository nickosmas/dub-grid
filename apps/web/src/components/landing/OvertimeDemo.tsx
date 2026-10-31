"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { LandingWindow } from "./LandingWindow";
import { Avatar } from "./LandingScheduleParts";
import { describeWeeklyHours } from "./landing-demo-logic";
import { useLandingSequence } from "./useLandingSequence";

const SCALE_HOURS = 48;
const MOVED_HOURS = 8;
const SAM = { before: 32, after: 40 };
const JORDAN = 38;
const MORGAN = { before: 44, after: 36 };

// Morgan over 40, Friday's 8 hours lift out of Morgan's bar, travel to the
// end of Sam's, then join it and nobody is over.
const STEPS = [2400, 900, 1100, 3600] as const;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a bar's track sits inside the stage, kept current as it resizes. */
function useTrackBoxes(
  stageRef: RefObject<HTMLDivElement | null>,
  trackRefs: RefObject<HTMLSpanElement | null>[],
): (Box | null)[] {
  const [boxes, setBoxes] = useState<(Box | null)[]>(trackRefs.map(() => null));

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const stageBox = stage.getBoundingClientRect();
      setBoxes(
        trackRefs.map((ref) => {
          const box = ref.current?.getBoundingClientRect();
          return box
            ? {
                left: box.left - stageBox.left,
                top: box.top - stageBox.top,
                width: box.width,
                height: box.height,
              }
            : null;
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, trackRefs]);

  return boxes;
}

export function OvertimeDemo() {
  const { ref, step } = useLandingSequence(STEPS);
  const stageRef = useRef<HTMLDivElement>(null);
  const samTrack = useRef<HTMLSpanElement>(null);
  const morganTrack = useRef<HTMLSpanElement>(null);
  const [trackRefs] = useState(() => [samTrack, morganTrack]);
  const [samBox, morganBox] = useTrackBoxes(stageRef, trackRefs);

  const lifted = step === 1 || step === 2;
  const samHours = step === 3 ? SAM.after : SAM.before;
  const morganHours = step === 0 ? MORGAN.before : MORGAN.after;
  // The moving block is Friday's shift: it starts where Morgan's bar ends
  // after losing it, and lands where Sam's bar ends before gaining it.
  const landed = step >= 2;
  const blockFrom = landed ? samBox : morganBox;
  const blockStartHours = landed ? SAM.before : MORGAN.after;
  const resolved = step === 3;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Morgan is on track for 44 hours, so a Friday shift moves to Sam and nobody goes over 40"
      className="landing-demo"
    >
      <LandingWindow stageRef={stageRef} className="landing-window-medium">
        <div aria-hidden="true">
          <div className="landing-toolbar">
            <span className="landing-toolbar-title">Hours this week</span>
            <span className="landing-badge" data-tone={resolved ? "success" : "danger"}>
              {resolved ? "No overtime this week" : "1 heading into overtime"}
            </span>
          </div>
          <HoursRow initials="SR" name="Sam R." hours={samHours} trackRef={samTrack} />
          <HoursRow initials="JT" name="Jordan T." hours={JORDAN} />
          <HoursRow
            initials="MK"
            name="Morgan K."
            hours={morganHours}
            trackRef={morganTrack}
            flagged={step === 1}
          />
          <div className="landing-hours-scale">
            <span>40h</span>
          </div>
        </div>
        {blockFrom && (
          <span
            className="landing-moving-shift"
            aria-hidden="true"
            data-shown={lifted || undefined}
            style={{
              width: (MOVED_HOURS / SCALE_HOURS) * blockFrom.width,
              transform: `translate(${blockFrom.left + (blockStartHours / SCALE_HOURS) * blockFrom.width}px, ${blockFrom.top + blockFrom.height / 2}px) translateY(-50%)`,
            }}
          >
            Fri · 8h
          </span>
        )}
      </LandingWindow>
    </div>
  );
}

function HoursRow({
  initials,
  name,
  hours,
  trackRef,
  flagged = false,
}: {
  initials: string;
  name: string;
  hours: number;
  trackRef?: RefObject<HTMLSpanElement | null>;
  flagged?: boolean;
}) {
  const bar = describeWeeklyHours(flagged ? hours + MOVED_HOURS : hours, SCALE_HOURS);
  const shown = describeWeeklyHours(hours, SCALE_HOURS);

  return (
    <div className="landing-hours-row" data-overtime={bar.isOvertime || undefined}>
      <span className="landing-grid-person">
        <Avatar initials={initials} />
        {name}
      </span>
      <span ref={trackRef} className="landing-hours-track">
        <span className="landing-hours-fill" style={{ width: `${shown.withinPercent}%` }} />
        <span className="landing-hours-over" style={{ width: `${shown.overPercent}%` }} />
        <span className="landing-hours-tick" />
      </span>
      <span className="landing-hours-label">
        <strong>{bar.hoursLabel}</strong> <span>{bar.detailLabel}</span>
      </span>
    </div>
  );
}
