"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, FilePen } from "lucide-react";
import { LandingCursor, LandingWindow } from "./LandingWindow";
import {
  Avatar,
  GridCell,
  GridHeaderRow,
  PersonNameCell,
  ShiftChip,
  WEEKDAYS,
  parseWeekPattern,
} from "./LandingScheduleParts";
import { useLandingSequence } from "./useLandingSequence";

const OPEN_DAY = 1;
// "T" marks the cell the open shift is filled into.
const PEOPLE = [
  { initials: "SR", name: "Sam R.", week: "DD-ED" },
  { initials: "JT", name: "Jordan T.", week: "ET-D-" },
  { initials: "MK", name: "Morgan K.", week: "D-D-E" },
] as const;

// Open shift, cursor to it, choices, cursor to Jordan, draft, cursor to Publish, published.
const STEPS = [2000, 900, 900, 800, 1600, 900, 3200] as const;
const CURSOR_TARGETS = [
  null,
  "open-shift",
  "open-shift",
  "pick-jordan",
  null,
  "publish",
  null,
] as const;

export function OpenShiftDemo() {
  const { ref, step } = useLandingSequence(STEPS);
  const stageRef = useRef<HTMLDivElement>(null);
  const open = step <= 3;
  const filled = step >= 4;
  const drafted = step === 4 || step === 5;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Tuesday's open evening shift is filled with an available person and published"
      className="landing-demo"
    >
      <LandingWindow stageRef={stageRef} className="landing-window-wide">
        <div aria-hidden="true">
          <div className="landing-toolbar">
            <span className="landing-week-nav">
              <ChevronLeft size={16} />
              <span className="landing-toolbar-title">Nov 3 - 7</span>
              <ChevronRight size={16} />
            </span>
            <span className="landing-btn landing-btn-secondary landing-btn-small">Today</span>
          </div>
          <div className="landing-draft-slot">
            <div className="landing-draft-banner" data-shown={drafted || undefined}>
              <FilePen size={15} />
              <span className="landing-draft-label">Draft changes</span>
              <span className="landing-draft-chip">1 new</span>
              <span className="landing-btn-row landing-draft-actions">
                <span className="landing-btn landing-btn-secondary landing-btn-small landing-btn-danger-text">
                  Discard
                </span>
                <span
                  className="landing-btn landing-btn-primary landing-btn-small"
                  data-landing-target="publish"
                >
                  Publish
                </span>
              </span>
            </div>
          </div>
          <div className="landing-grid">
            <GridHeaderRow />
            <div className="landing-grid-row">
              <div className="landing-grid-cell landing-grid-open-label">Open shift</div>
              {WEEKDAYS.map((day, index) => (
                <GridCell key={day}>
                  {index === OPEN_DAY && (
                    <span className="landing-open-slot">
                      <span
                        className="landing-chip landing-chip-open"
                        data-landing-target="open-shift"
                        data-hidden={!open || undefined}
                        data-focused={step === 0 || undefined}
                        data-pressed={step === 2 || undefined}
                      >
                        Evening
                      </span>
                      <span
                        className="landing-popover"
                        data-shown={step === 2 || step === 3 || undefined}
                      >
                        <span className="landing-popover-label">Available</span>
                        <span
                          className="landing-popover-option"
                          data-landing-target="pick-jordan"
                          data-active={step === 3 || undefined}
                        >
                          <Avatar initials="JT" />
                          Jordan T.
                        </span>
                        <span className="landing-popover-option">
                          <Avatar initials="MK" />
                          Morgan K.
                        </span>
                      </span>
                    </span>
                  )}
                </GridCell>
              ))}
            </div>
            {PEOPLE.map((person) => (
              <div key={person.name} className="landing-grid-row">
                <PersonNameCell initials={person.initials} name={person.name} />
                {[...person.week].map((letter, day) => {
                  if (letter === "T") {
                    return (
                      <GridCell key={day}>
                        {filled && (
                          <ShiftChip
                            kind="evening"
                            className="landing-pop-in"
                            data-draft={drafted || undefined}
                          />
                        )}
                      </GridCell>
                    );
                  }
                  const kind = parseWeekPattern(letter)[0];
                  return <GridCell key={day}>{kind && <ShiftChip kind={kind} />}</GridCell>;
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="landing-toast" data-shown={step === 6 || undefined} aria-hidden="true">
          <CircleCheck size={16} className="landing-toast-icon" />
          Schedule published
        </div>
        <LandingCursor stageRef={stageRef} target={CURSOR_TARGETS[step]} />
      </LandingWindow>
    </div>
  );
}
