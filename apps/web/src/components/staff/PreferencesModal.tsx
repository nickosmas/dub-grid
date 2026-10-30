"use client";

import { useState } from "react";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import {
  formatScheduleTimeRange,
  type CoverageJobPreference,
  type CoverageShiftPreference,
} from "@dubgrid/schedule-core";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import type { JobDefinition, ShiftCategory } from "@/types";

type Mode = "any" | CoverageShiftPreference["mode"];
type Kind = "shifts" | "jobs";

const WORDS: Record<Kind, { one: string; many: string }> = {
  shifts: { one: "shift", many: "shifts" },
  jobs: { one: "job", many: "jobs" },
};

function modesFor(kind: Kind): { value: Mode; title: string; detail: string }[] {
  const { one, many } = WORDS[kind];
  return [
    {
      value: "any",
      title: `Any ${one}`,
      detail: `Auto-build can give them any ${one} they're qualified for.`,
    },
    {
      value: "prefers",
      title: `Prefers some ${many}`,
      detail: `They get these ${many} first, and others when needed.`,
    },
    { value: "only", title: `Only some ${many}`, detail: `They never get any other ${one}.` },
  ];
}

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

/** "Only Evening Shift", "Prefers Supervisor, Nurse", or null without a preference. */
export function describePreference(
  preference: { mode: Mode; ids: number[] } | undefined,
  name: (id: number) => string | undefined,
): string | null {
  if (!preference || preference.mode === "any") return null;
  const names = preference.ids.map(name).filter(Boolean).join(", ");
  return `${preference.mode === "only" ? "Only" : "Prefers"} ${names}`;
}

/** "Only Supervisor · Prefers Day Shift", the job first, or null without either. */
export function describePreferences(
  shift: CoverageShiftPreference | undefined,
  job: CoverageJobPreference | undefined,
  shiftName: (shiftId: number) => string | undefined,
  jobName: (jobId: number) => string | undefined,
): string | null {
  const parts = [
    describePreference(job && { mode: job.mode, ids: job.jobIds }, jobName),
    describePreference(shift && { mode: shift.mode, ids: shift.shiftIds }, shiftName),
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

interface Item {
  id: number;
  name: string;
  detail: string | null;
}

/** The person's shifts by focus area, in the order given; global shifts last. */
function groupShifts(
  shifts: ReadonlyArray<ShiftCategory>,
  focusAreaName: (focusAreaId: number) => string | undefined,
): { key: string; title: string | null; items: Item[] }[] {
  const groups = new Map<string, { key: string; title: string | null; items: Item[] }>();
  for (const shift of shifts) {
    const key = shift.focusAreaId == null ? "general" : String(shift.focusAreaId);
    const title =
      shift.focusAreaId == null ? "Any focus area" : (focusAreaName(shift.focusAreaId) ?? null);
    const group = groups.get(key) ?? { key, title, items: [] };
    group.items.push({
      id: shift.id,
      name: shift.name,
      detail: formatScheduleTimeRange(shift.startTime ?? null, shift.endTime ?? null) || null,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

interface Choice {
  mode: Mode;
  ids: number[];
}

/** Only the kinds the person changed; null clears that preference. */
export interface PreferencesSave {
  shift?: CoverageShiftPreference | null;
  job?: CoverageJobPreference | null;
}

export function PreferencesModal({
  personName,
  shifts,
  jobs,
  focusAreaName,
  shiftPreference,
  jobPreference,
  onSave,
  onClose,
}: {
  personName: string;
  /** The shifts this person can be given. */
  shifts: ShiftCategory[];
  /** The jobs this person can be given. */
  jobs: JobDefinition[];
  focusAreaName: (focusAreaId: number) => string | undefined;
  shiftPreference: CoverageShiftPreference | undefined;
  jobPreference: CoverageJobPreference | undefined;
  /** Resolves once saved; null clears that preference. */
  onSave: (preferences: PreferencesSave) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"start" | Kind>("start");
  const [choices, setChoices] = useState<Record<Kind, Choice>>({
    shifts: { mode: shiftPreference?.mode ?? "any", ids: shiftPreference?.shiftIds ?? [] },
    jobs: { mode: jobPreference?.mode ?? "any", ids: jobPreference?.jobIds ?? [] },
  });
  // A kind left alone is not saved, so a shift or job that has since gone stays stored.
  const [touched, setTouched] = useState<Record<Kind, boolean>>({ shifts: false, jobs: false });
  const [saving, setSaving] = useState(false);
  const available: Record<Kind, number[]> = {
    shifts: shifts.map((shift) => shift.id),
    jobs: jobs.map((job) => job.id),
  };
  const chosen = (kind: Kind) => choices[kind].ids.filter((id) => available[kind].includes(id));
  const needsItem = (kind: Kind) => choices[kind].mode !== "any" && chosen(kind).length === 0;
  const names: Record<Kind, (id: number) => string | undefined> = {
    shifts: (id) => shifts.find((shift) => shift.id === id)?.name,
    jobs: (id) => jobs.find((job) => job.id === id)?.name,
  };
  const summary = (kind: Kind) =>
    needsItem(kind)
      ? `Choose at least one ${WORDS[kind].one}`
      : (describePreference({ mode: choices[kind].mode, ids: chosen(kind) }, names[kind]) ??
        `Any ${WORDS[kind].one}`);
  const setChoice = (kind: Kind, change: (choice: Choice) => Choice) => {
    setChoices((current) => ({ ...current, [kind]: change(current[kind]) }));
    setTouched((current) => ({ ...current, [kind]: true }));
  };
  const blocked = (kind: Kind) => touched[kind] && needsItem(kind);

  const save = async () => {
    setSaving(true);
    try {
      const shift = choices.shifts;
      const job = choices.jobs;
      const preferences: PreferencesSave = {};
      if (touched.shifts) {
        preferences.shift =
          shift.mode === "any" ? null : { mode: shift.mode, shiftIds: chosen("shifts") };
      }
      if (touched.jobs) {
        preferences.job = job.mode === "any" ? null : { mode: job.mode, jobIds: chosen("jobs") };
      }
      await onSave(preferences);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      icon={SlidersHorizontal}
      title={
        step === "start" ? "Preferences" : step === "shifts" ? "Shift preference" : "Job preference"
      }
      subtitle={personName}
      onBack={step === "start" ? undefined : () => setStep("start")}
      onClose={onClose}
      onRequestClose={() => !saving}
      className="dg-modal--quiet-footer"
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
            disabled={blocked("shifts") || blocked("jobs") || saving}
          >
            <ButtonLoading loading={saving}>Save</ButtonLoading>
          </Button>
        </div>
      }
    >
      {step === "start" ? (
        <div className="dg-choice-list" role="group" aria-label="Preferences">
          {(["shifts", "jobs"] as const).map((kind) => (
            <button key={kind} type="button" className="dg-choice" onClick={() => setStep(kind)}>
              <span className="dg-choice-copy">
                <strong className="dg-choice-title">{kind === "shifts" ? "Shifts" : "Jobs"}</strong>
                <span className={needsItem(kind) ? "dg-choice-hint" : "dg-choice-detail"}>
                  {summary(kind)}
                </span>
              </span>
              <ChevronRight size={18} className="dg-choice-chevron" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <PreferenceStep
          kind={step}
          choice={choices[step]}
          chosen={chosen(step)}
          groups={
            step === "shifts"
              ? groupShifts(shifts, focusAreaName)
              : [
                  {
                    key: "jobs",
                    title: null,
                    items: jobs.map((job) => ({ id: job.id, name: job.name, detail: null })),
                  },
                ]
          }
          needsItem={needsItem(step)}
          onChange={(change) => setChoice(step, change)}
        />
      )}
    </Modal>
  );
}

function PreferenceStep({
  kind,
  choice,
  chosen,
  groups,
  needsItem,
  onChange,
}: {
  kind: Kind;
  choice: Choice;
  chosen: number[];
  groups: { key: string; title: string | null; items: Item[] }[];
  needsItem: boolean;
  onChange: (change: (choice: Choice) => Choice) => void;
}) {
  const { one, many } = WORDS[kind];
  const leftOut =
    kind === "shifts" && choice.mode === "only" && chosen.length > 0
      ? groups.filter(
          (group) =>
            group.key !== "general" &&
            group.title &&
            !group.items.some((item) => chosen.includes(item.id)),
        )
      : [];
  return (
    <div className="flex flex-col gap-5">
      <div
        className="dg-choice-list"
        role="radiogroup"
        aria-label={`Which ${many} Auto-build gives them`}
      >
        {modesFor(kind).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice.mode === option.value}
            className="dg-choice"
            onClick={() => onChange((current) => ({ ...current, mode: option.value }))}
          >
            <span className="dg-choice-mark" aria-hidden="true" />
            <span className="dg-choice-copy">
              <strong className="dg-choice-title">{option.title}</strong>
              <span className="dg-choice-detail">{option.detail}</span>
            </span>
          </button>
        ))}
      </div>

      {choice.mode !== "any" && (
        <div className="flex flex-col gap-3">
          <div className="dg-choice-heading">
            {choice.mode === "only" ? `The only ${many} they work` : `The ${many} they prefer`}
          </div>
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              {groups.length > 1 && group.title && (
                <div className="dg-choice-group-title">{group.title}</div>
              )}
              <div
                className="dg-choice-list"
                role="group"
                aria-label={group.title ?? (kind === "shifts" ? "Shifts" : "Jobs")}
              >
                {group.items.map((item) => {
                  const on = chosen.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="dg-choice dg-choice--compact"
                      onClick={() =>
                        onChange((current) => ({
                          ...current,
                          ids: on
                            ? current.ids.filter((id) => id !== item.id)
                            : [...current.ids, item.id],
                        }))
                      }
                    >
                      <span className="dg-choice-mark dg-choice-mark--check" aria-hidden="true" />
                      <span className="dg-choice-copy dg-choice-copy--inline">
                        <strong className="dg-choice-title">{item.name}</strong>
                        {item.detail && (
                          <span className="dg-choice-detail dg-tabular-nums">{item.detail}</span>
                        )}
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
          {needsItem && (
            <p className="dg-choice-hint" role="status">
              Choose at least one {one}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
