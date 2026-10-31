"use client";

import { useRef } from "react";
import { Check, Lock, Minus } from "lucide-react";
import { LandingCursor, LandingWindow } from "./LandingWindow";
import { useLandingSequence } from "./useLandingSequence";

type Cell = "yes" | "no" | "lock" | { toggle: string };

const ROWS: { label: string; user: Cell; admin: Cell; superAdmin: Cell }[] = [
  { label: "See the schedule", user: "yes", admin: "yes", superAdmin: "yes" },
  { label: "Ask to swap or give up a shift", user: "yes", admin: "yes", superAdmin: "yes" },
  { label: "Edit shifts", user: "no", admin: { toggle: "edit" }, superAdmin: "yes" },
  { label: "Publish the schedule", user: "no", admin: { toggle: "publish" }, superAdmin: "yes" },
  { label: "Approve shift requests", user: "no", admin: { toggle: "approve" }, superAdmin: "yes" },
  { label: "Billing", user: "no", admin: "lock", superAdmin: "yes" },
];

// Each switch: the cursor reaches it, then it turns on. Then a rest.
const STEPS = [1400, 700, 350, 700, 350, 700, 350, 3200] as const;
const CURSOR_TARGETS = [
  null,
  "edit",
  "edit",
  "publish",
  "publish",
  "approve",
  "approve",
  null,
] as const;
const TURNS_ON_AT: Record<string, number> = { edit: 2, publish: 4, approve: 6 };

export function AccessDemo() {
  const { ref, step } = useLandingSequence(STEPS);
  const stageRef = useRef<HTMLDivElement>(null);

  const renderCell = (cell: Cell) => {
    if (cell === "yes") return <Check size={16} className="landing-access-yes" />;
    if (cell === "no") return <Minus size={16} className="landing-access-no" />;
    if (cell === "lock") return <Lock size={15} className="landing-access-no" />;
    const on = step >= TURNS_ON_AT[cell.toggle];
    return (
      <span
        className="landing-switch"
        data-on={on || undefined}
        data-landing-target={cell.toggle}
        data-pressed={step === TURNS_ON_AT[cell.toggle] || undefined}
      />
    );
  };

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Staff see the schedule and ask for swaps, each Admin gets only the powers you turn on, and billing stays with Super Admins"
      className="landing-demo"
    >
      <LandingWindow stageRef={stageRef} className="landing-window-medium">
        <div className="landing-access" aria-hidden="true">
          <span />
          <span className="landing-access-head">
            <strong>User</strong>
            <span>Staff</span>
          </span>
          <span className="landing-access-head" data-admin>
            <strong>Admin</strong>
            <span>You choose</span>
          </span>
          <span className="landing-access-head">
            <strong>Super Admin</strong>
            <span>Owner</span>
          </span>
          {ROWS.map((row) => (
            <div key={row.label} className="landing-access-row">
              <span className="landing-access-label">{row.label}</span>
              <span className="landing-access-cell">{renderCell(row.user)}</span>
              <span className="landing-access-cell" data-admin>
                {renderCell(row.admin)}
              </span>
              <span className="landing-access-cell">{renderCell(row.superAdmin)}</span>
            </div>
          ))}
        </div>
        <LandingCursor stageRef={stageRef} target={CURSOR_TARGETS[step]} />
      </LandingWindow>
    </div>
  );
}
