"use client";

import { useRef } from "react";
import { LandingCursor, LandingWindow } from "./LandingWindow";
import {
  GridCell,
  GridHeaderRow,
  PersonNameCell,
  ShiftChip,
  parseWeekPattern,
} from "./LandingScheduleParts";
import { useLandingSequence } from "./useLandingSequence";

const PEOPLE = [
  { initials: "SR", name: "Sam R.", week: "DDEDD" },
  { initials: "JT", name: "Jordan T.", week: "EDDE-" },
  { initials: "MK", name: "Morgan K.", week: "-EEDD" },
] as const;

// Empty, cursor to Generate, filling, preview, cursor to Apply, applied.
const STEPS = [1600, 900, 2200, 1200, 900, 2600] as const;
const CURSOR_TARGETS = [null, "generate", null, null, "apply", null] as const;
const COLUMN_REVEAL_MS = 340;

export function AutoBuildDemo() {
  const { ref, step } = useLandingSequence(STEPS);
  const stageRef = useRef<HTMLDivElement>(null);
  const filling = step === 2;
  const filled = step >= 2;
  const applied = step === 5;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Generate schedule fills next week's open shifts, ready to apply"
      className="landing-demo"
    >
      <LandingWindow stageRef={stageRef} className="landing-window-wide">
        <div aria-hidden="true">
          <div className="landing-toolbar">
            <span className="landing-toolbar-title">Next week</span>
            <span
              className="landing-btn landing-btn-secondary"
              data-landing-target="generate"
              data-pressed={step === 2 || undefined}
            >
              Generate schedule
            </span>
          </div>
          <div className="landing-progress">
            <span data-running={filling || undefined} data-full={filled || undefined} />
          </div>
          <div className="landing-grid">
            <GridHeaderRow />
            {PEOPLE.map((person) => (
              <div key={person.name} className="landing-grid-row">
                <PersonNameCell initials={person.initials} name={person.name} />
                {parseWeekPattern(person.week).map((kind, day) => (
                  <GridCell key={day}>
                    {kind && (
                      <ShiftChip
                        kind={kind}
                        className="landing-reveal"
                        data-shown={filled || undefined}
                        style={
                          filling
                            ? { transitionDelay: `${(day + 1) * COLUMN_REVEAL_MS}ms` }
                            : undefined
                        }
                      />
                    )}
                  </GridCell>
                ))}
              </div>
            ))}
          </div>
          <div className="landing-preview-bar" data-shown={step >= 3 || undefined}>
            <span>{applied ? "Added to next week" : "12 shifts filled"}</span>
            <span className="landing-btn-row" data-hidden={applied || undefined}>
              <span className="landing-btn landing-btn-secondary">Discard</span>
              <span className="landing-btn landing-btn-primary" data-landing-target="apply">
                Apply
              </span>
            </span>
          </div>
        </div>
        <LandingCursor stageRef={stageRef} target={CURSOR_TARGETS[step]} />
      </LandingWindow>
    </div>
  );
}
