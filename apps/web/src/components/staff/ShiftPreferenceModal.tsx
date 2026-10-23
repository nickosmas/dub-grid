"use client";

import { useState } from "react";
import { formatScheduleTimeRange, type CoverageShiftPreference } from "@dubgrid/schedule-core";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import type { ShiftCategory } from "@/types";

type Mode = "any" | CoverageShiftPreference["mode"];

const MODES: { value: Mode; title: string; detail: string }[] = [
  {
    value: "any",
    title: "Any shift",
    detail: "Auto-build can give them any shift they're qualified for.",
  },
  {
    value: "prefers",
    title: "Prefers some shifts",
    detail: "They get these shifts first, and others when needed.",
  },
  { value: "only", title: "Only some shifts", detail: "They never get any other shift." },
];

/** "Day Shift", or "Day Shift (Skilled Nursing)" when another shift has the same name. */
export function shiftLabel(
  shift: ShiftCategory,
  shifts: ReadonlyArray<ShiftCategory>,
  focusAreaName: (focusAreaId: number) => string | undefined,
): string {
  const shared = shifts.some((other) => other.id !== shift.id && other.name === shift.name);
  const area = shift.focusAreaId != null ? focusAreaName(shift.focusAreaId) : undefined;
  return shared && area ? `${shift.name} (${area})` : shift.name;
}

/** "Only Evening Shift", "Prefers Day Shift, Evening Shift", or null without a preference. */
export function describeShiftPreference(
  preference: CoverageShiftPreference | undefined,
  shiftName: (shiftId: number) => string | undefined,
): string | null {
  if (!preference) return null;
  const names = preference.shiftIds.map(shiftName).filter(Boolean).join(", ");
  return `${preference.mode === "only" ? "Only" : "Prefers"} ${names}`;
}

/** The person's shifts by focus area, in the order given; global shifts last. */
function groupShifts(
  shifts: ReadonlyArray<ShiftCategory>,
  focusAreaName: (focusAreaId: number) => string | undefined,
): { key: string; title: string | null; shifts: ShiftCategory[] }[] {
  const groups = new Map<string, { key: string; title: string | null; shifts: ShiftCategory[] }>();
  for (const shift of shifts) {
    const key = shift.focusAreaId == null ? "general" : String(shift.focusAreaId);
    const title =
      shift.focusAreaId == null ? "Any focus area" : (focusAreaName(shift.focusAreaId) ?? null);
    const group = groups.get(key) ?? { key, title, shifts: [] };
    group.shifts.push(shift);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function ShiftPreferenceModal({
  personName,
  shifts,
  focusAreaName,
  preference,
  onSave,
  onClose,
}: {
  personName: string;
  /** The shifts this person can be given. */
  shifts: ShiftCategory[];
  focusAreaName: (focusAreaId: number) => string | undefined;
  preference: CoverageShiftPreference | undefined;
  /** Resolves once saved; null clears the preference. */
  onSave: (preference: CoverageShiftPreference | null) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(preference?.mode ?? "any");
  const [shiftIds, setShiftIds] = useState<number[]>(preference?.shiftIds ?? []);
  const [saving, setSaving] = useState(false);
  const chosen = shiftIds.filter((id) => shifts.some((shift) => shift.id === id));
  const needsShift = mode !== "any" && chosen.length === 0;
  const groups = groupShifts(shifts, focusAreaName);
  const leftOut =
    mode === "only" && chosen.length > 0
      ? groups.filter(
          (group) =>
            group.key !== "general" &&
            group.title &&
            !group.shifts.some((shift) => chosen.includes(shift.id)),
        )
      : [];

  const save = async () => {
    setSaving(true);
    try {
      await onSave(mode === "any" ? null : { mode, shiftIds: chosen });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Shift preference for ${personName}`}
      onClose={onClose}
      onRequestClose={() => !saving}
      style={{ maxWidth: 520, width: "100%" }}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={() => save()}
            disabled={needsShift || saving}
          >
            <ButtonLoading loading={saving}>Save</ButtonLoading>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          className="dg-choice-list"
          role="radiogroup"
          aria-label="Which shifts Auto-build gives them"
        >
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              className="dg-choice"
              onClick={() => setMode(option.value)}
            >
              <span className="dg-choice-mark" aria-hidden="true" />
              <span className="dg-choice-copy">
                <strong className="dg-choice-title">{option.title}</strong>
                <span className="dg-choice-detail">{option.detail}</span>
              </span>
            </button>
          ))}
        </div>

        {mode !== "any" && (
          <div className="flex flex-col gap-3">
            <div className="dg-choice-heading">
              {mode === "only" ? "The only shifts they work" : "The shifts they prefer"}
            </div>
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-2">
                {groups.length > 1 && group.title && (
                  <div className="dg-choice-group-title">{group.title}</div>
                )}
                <div className="dg-choice-list" role="group" aria-label={group.title ?? "Shifts"}>
                  {group.shifts.map((shift) => {
                    const on = chosen.includes(shift.id);
                    const time = formatScheduleTimeRange(
                      shift.startTime ?? null,
                      shift.endTime ?? null,
                    );
                    return (
                      <button
                        key={shift.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        className="dg-choice dg-choice--compact"
                        onClick={() =>
                          setShiftIds((current) =>
                            on ? current.filter((id) => id !== shift.id) : [...current, shift.id],
                          )
                        }
                      >
                        <span className="dg-choice-mark dg-choice-mark--check" aria-hidden="true" />
                        <span className="dg-choice-copy">
                          <strong className="dg-choice-title">{shift.name}</strong>
                          {time && <span className="dg-choice-detail dg-tabular-nums">{time}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {leftOut.length > 0 && (
              <p className="dg-choice-hint" role="status">
                They won't be given shifts in {leftOut.map((group) => group.title).join(" or ")}.
              </p>
            )}
            {needsShift && (
              <p className="dg-choice-hint" role="status">
                Choose at least one shift.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
