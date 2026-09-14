"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserRound } from "lucide-react";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import { Button } from "@/components/Button";
import { getEmployeeDisplayName } from "@/lib/utils";
import type {
  OpenShiftStaffingCandidate,
  OpenShiftStaffingOption,
} from "@/app/(app)/schedule/_lib/open-shift-staffing";

interface OpenShiftStaffingModalProps {
  assignmentLabel: string;
  assignmentLabelById: ReadonlyMap<number, string>;
  candidates: OpenShiftStaffingCandidate[];
  dateLabel: string;
  needed: number;
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

export function OpenShiftStaffingModal({
  assignmentLabel,
  assignmentLabelById,
  candidates,
  dateLabel,
  needed,
  isSubmitting = false,
  onAssign,
  onClose,
}: OpenShiftStaffingModalProps) {
  const [query, setQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(candidates[0]?.employee.id ?? "");
  const selectedCandidate =
    candidates.find((candidate) => candidate.employee.id === selectedEmployeeId) ?? null;
  const [selectedOptionKey, setSelectedOptionKey] = useState(
    selectedCandidate?.options[0] ? optionKey(selectedCandidate.options[0]) : "",
  );

  useEffect(() => {
    if (selectedCandidate) return;
    const first = candidates[0] ?? null;
    setSelectedEmployeeId(first?.employee.id ?? "");
    setSelectedOptionKey(first?.options[0] ? optionKey(first.options[0]) : "");
  }, [candidates, selectedCandidate]);

  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) =>
      getEmployeeDisplayName(candidate.employee).toLowerCase().includes(normalized),
    );
  }, [candidates, query]);

  const selectedOption =
    selectedCandidate?.options.find((option) => optionKey(option) === selectedOptionKey) ??
    selectedCandidate?.options[0] ??
    null;

  const selectCandidate = (candidate: OpenShiftStaffingCandidate) => {
    setSelectedEmployeeId(candidate.employee.id);
    setSelectedOptionKey(optionKey(candidate.options[0]));
  };

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
            aria-label="Assign to schedule"
            disabled={!selectedCandidate || !selectedOption || isSubmitting}
            loading={isSubmitting}
            onClick={() =>
              selectedCandidate && selectedOption
                ? onAssign(selectedCandidate, selectedOption)
                : undefined
            }
          >
            Assign to schedule
          </Button>
        </div>
      }
    >
      <div className="dg-open-shift-staffing-summary">
        <strong>{assignmentLabel}</strong>
        <span>{dateLabel}</span>
        <span>{needed === 1 ? "1 person needed" : `${needed} people needed`}</span>
      </div>

      {candidates.length > 0 ? (
        <label className="dg-open-shift-staffing-search">
          <span className="sr-only">Search eligible staff</span>
          <Search aria-hidden="true" size={17} />
          <input
            className="dg-input"
            value={query}
            placeholder="Search eligible staff"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      ) : null}

      {candidates.length === 0 ? (
        <div className="dg-open-shift-staffing-empty" role="status">
          <UserRound aria-hidden="true" size={22} />
          <strong>No eligible staff</strong>
          <span>
            Everyone is unavailable, absent, outside this focus area, or missing a requirement.
          </span>
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
            const employment = employee.employmentType === "part_time" ? "Part-time" : "Full-time";
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
                  <strong>{getEmployeeDisplayName(employee)}</strong>
                  <span>
                    {employment}
                    {candidate.existingState?.kind === "worked"
                      ? " · Already working that day"
                      : ""}
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
