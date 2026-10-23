"use client";

import { useState } from "react";
import type { CoverageShiftPreference } from "@dubgrid/schedule-core";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import CustomSelect from "@/components/CustomSelect";
import type { ShiftCategory } from "@/types";

type Mode = "none" | CoverageShiftPreference["mode"];

const MODE_HELP: Record<Mode, string> = {
  none: "Auto-build can give them any shift they are qualified for.",
  prefers: "Auto-build gives them these shifts first, and others when it needs to.",
  only: "Auto-build never gives them any other shift.",
};

/** "Only: Evening Shift, Night Shift", or null without a preference. */
export function describeShiftPreference(
  preference: CoverageShiftPreference | undefined,
  shiftName: (shiftId: number) => string | undefined,
): string | null {
  if (!preference) return null;
  const names = preference.shiftIds.map(shiftName).filter(Boolean).join(", ");
  return `${preference.mode === "only" ? "Only" : "Prefers"}: ${names}`;
}

export function ShiftPreferenceModal({
  personName,
  shifts,
  preference,
  onSave,
  onClose,
}: {
  personName: string;
  /** The shifts this person can be given. */
  shifts: ShiftCategory[];
  preference: CoverageShiftPreference | undefined;
  /** Resolves once saved; null clears the preference. */
  onSave: (preference: CoverageShiftPreference | null) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(preference?.mode ?? "none");
  const [shiftIds, setShiftIds] = useState<number[]>(preference?.shiftIds ?? []);
  const [saving, setSaving] = useState(false);
  const chosen = shiftIds.filter((id) => shifts.some((shift) => shift.id === id));
  const canSave = mode === "none" || chosen.length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(mode === "none" ? null : { mode, shiftIds: chosen });
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
      style={{ maxWidth: 480, width: "100%" }}
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
            disabled={!canSave || saving}
          >
            <ButtonLoading loading={saving}>Save</ButtonLoading>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <CustomSelect
            id="shift-preference-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "none", label: "No preference" },
              { value: "prefers", label: "Prefers these shifts" },
              { value: "only", label: "Only these shifts" },
            ]}
          />
          <p className="dg-cc-detail-line dg-cc-detail-line--muted">{MODE_HELP[mode]}</p>
        </div>
        {mode !== "none" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Shifts">
            {shifts.map((shift) => {
              const on = chosen.includes(shift.id);
              return (
                <Button
                  key={shift.id}
                  type="button"
                  aria-pressed={on}
                  className={`dg-btn dg-btn-secondary${on ? " dg-btn-toggled" : ""}`}
                  onClick={() =>
                    setShiftIds((current) =>
                      on ? current.filter((id) => id !== shift.id) : [...current, shift.id],
                    )
                  }
                >
                  {shift.name}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
