"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserRound } from "lucide-react";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import { SectionNotice } from "@/components/ui/SectionNotice";
import { Button } from "@/components/Button";
import { fmt12h } from "@/components/shiftEditTime";
import { getEmployeeDisplayName } from "@/lib/utils";
import type {
  OpenShiftStaffingCandidate,
  OpenShiftStaffingOption,
} from "@/app/(app)/schedule/_lib/open-shift-staffing";

interface OpenShiftStaffingModalProps {
  assignmentLabel: string;
  assignmentLabelById: ReadonlyMap<number, string>;
  absenceTypeLabelById: ReadonlyMap<number, string>;
  candidates: OpenShiftStaffingCandidate[];
  dateLabel: string;
  needed: number;
  currentEmployeeId?: string | null;
  isSubmitting?: boolean;
  onAssign: (candidate: OpenShiftStaffingCandidate, option: OpenShiftStaffingOption) => unknown;
  onClose: () => void;
}

function optionKey(option: OpenShiftStaffingOption): string {
  return option.assignmentIds.join(",");
}

function optionLabel(
  option: OpenShiftStaffingOption,
  assignmentLabelById: ReadonlyMap<number, string>,
): string {
  return option.assignmentIds
    .map((assignmentId) => assignmentLabelById.get(assignmentId) ?? "Unavailable assignment")
    .join(" / ");
}

function existingWorkLabel(
  candidate: OpenShiftStaffingCandidate,
  assignmentLabelById: ReadonlyMap<number, string>,
  absenceTypeLabelById: ReadonlyMap<number, string>,
): string {
  if (candidate.existingState?.absenceTypeId != null) {
    const absenceLabel =
      absenceTypeLabelById.get(candidate.existingState.absenceTypeId) ?? "Unknown absence";
    return `Absent: ${absenceLabel}`;
  }
  if (candidate.existingAssignments.length === 0) return "Available all day";

  const assignments = candidate.existingAssignments.map(({ assignmentId, timeRange }) => {
    const label = assignmentLabelById.get(assignmentId) ?? "Unavailable assignment";
    return timeRange ? `${label}, ${fmt12h(timeRange.start)}–${fmt12h(timeRange.end)}` : label;
  });
  return assignments.join("; ");
}

export function OpenShiftStaffingModal({
  assignmentLabel,
  assignmentLabelById,
  absenceTypeLabelById,
  candidates,
  dateLabel,
  needed,
  currentEmployeeId = null,
  isSubmitting = false,
  onAssign,
  onClose,
}: OpenShiftStaffingModalProps) {
  const [query, setQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedOptionKey, setSelectedOptionKey] = useState("");

  useEffect(() => {
    if (!selectedEmployeeId) return;
    if (candidates.some((candidate) => candidate.employee.id === selectedEmployeeId)) return;
    setSelectedEmployeeId("");
    setSelectedOptionKey("");
  }, [candidates, selectedEmployeeId]);

  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? candidates.filter((candidate) =>
          getEmployeeDisplayName(candidate.employee).toLowerCase().includes(normalized),
        )
      : candidates;
    return [...filtered].sort((left, right) => {
      if (left.employee.id === currentEmployeeId) return -1;
      if (right.employee.id === currentEmployeeId) return 1;
      return 0;
    });
  }, [candidates, currentEmployeeId, query]);

  const selectedCandidate =
    visibleCandidates.find((candidate) => candidate.employee.id === selectedEmployeeId) ?? null;

  const selectedOption =
    selectedCandidate?.options.find((option) => optionKey(option) === selectedOptionKey) ??
    selectedCandidate?.options[0] ??
    null;

  const selectCandidate = (candidate: OpenShiftStaffingCandidate) => {
    setSelectedEmployeeId(candidate.employee.id);
    setSelectedOptionKey(optionKey(candidate.options[0]));
  };
  const assignLabel =
    selectedCandidate?.employee.id === currentEmployeeId ? "Assign myself" : "Assign to schedule";

  return (
    <Modal
      title="Assign open shift"
      className="dg-open-shift-staffing-modal"
      onClose={onClose}
      disableOverlayClose={isSubmitting}
      footer={
        <div className="dg-open-shift-staffing-actions">
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            aria-label={assignLabel}
            disabled={!selectedCandidate || !selectedOption || isSubmitting}
            loading={isSubmitting}
            onClick={() =>
              selectedCandidate && selectedOption
                ? onAssign(selectedCandidate, selectedOption)
                : undefined
            }
          >
            {assignLabel}
          </Button>
        </div>
      }
    >
      <div className="dg-open-shift-staffing-summary">
        <strong>{assignmentLabel}</strong>
        <span>{dateLabel}</span>
        <span>{needed === 1 ? "1 person needed" : `${needed} people needed`}</span>
      </div>

      {/* The adjacent-day overlap check reads the loaded shift window; when a
          neighbouring day is outside it the check cannot run for anyone, so
          say so rather than present the list as fully vetted. */}
      {candidates.some((candidate) => candidate.adjacentCheckUnverified) && (
        <SectionNotice
          tone="warning"
          messages={[
            "Shifts on the day before or after this date are not loaded, so overnight overlaps with them could not be checked.",
          ]}
        />
      )}

      {candidates.length > 0 ? (
        <label className="dg-open-shift-staffing-search">
          <span className="sr-only">Search eligible staff</span>
          <Search aria-hidden="true" size={17} />
          <input
            className="dg-input"
            value={query}
            placeholder="Search eligible staff"
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (
                selectedCandidate &&
                !getEmployeeDisplayName(selectedCandidate.employee)
                  .toLowerCase()
                  .includes(nextQuery.trim().toLowerCase())
              ) {
                setSelectedEmployeeId("");
                setSelectedOptionKey("");
              }
            }}
          />
        </label>
      ) : null}

      {candidates.length === 0 ? (
        <div className="dg-open-shift-staffing-empty" role="status">
          <UserRound aria-hidden="true" size={22} />
          <strong>No eligible staff</strong>
          <span>Everyone is unavailable, outside this focus area, or missing a requirement.</span>
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div className="dg-open-shift-staffing-empty" role="status">
          <strong>No matching staff</strong>
          <span>Try a different name.</span>
        </div>
      ) : (
        <div className="dg-open-shift-staffing-list" role="radiogroup" aria-label="Eligible staff">
          {visibleCandidates.map((candidate) => {
            const employee = candidate.employee;
            const selected = employee.id === selectedEmployeeId;
            const isCurrentEmployee = employee.id === currentEmployeeId;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className="dg-open-shift-staffing-person"
                key={employee.id}
                onClick={() => selectCandidate(candidate)}
              >
                <span className="dg-open-shift-staffing-radio" aria-hidden="true" />
                <span className="dg-open-shift-staffing-person-copy">
                  <strong>
                    {getEmployeeDisplayName(employee)}
                    {isCurrentEmployee ? " (You)" : ""}
                  </strong>
                  <span>
                    {existingWorkLabel(candidate, assignmentLabelById, absenceTypeLabelById)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedCandidate && selectedCandidate.options.length > 1 ? (
        <div className="dg-open-shift-staffing-assignment">
          <label htmlFor="open-shift-assignment">Shift and job</label>
          <CustomSelect
            id="open-shift-assignment"
            ariaLabel="Shift and job"
            value={selectedOption ? optionKey(selectedOption) : ""}
            options={selectedCandidate.options.map((option) => ({
              value: optionKey(option),
              label: optionLabel(option, assignmentLabelById),
            }))}
            onChange={setSelectedOptionKey}
            disabled={isSubmitting}
            style={{ width: "100%" }}
          />
        </div>
      ) : null}
    </Modal>
  );
}
