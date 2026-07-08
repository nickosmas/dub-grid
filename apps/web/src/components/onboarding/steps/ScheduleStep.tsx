"use client";

import { useState, useCallback } from "react";
import StepLayout from "../StepLayout";
import CompositeSection from "./CompositeSection";
import { DisplayModeSample, DISPLAY_MODES } from "@/components/settings/DisplayMode";
import ShiftCategoriesSettings from "@/components/settings/ShiftCategories";
import JobsSettings from "@/components/settings/Jobs";
import { useOrganizationData } from "@/hooks";
import { updateOrganizationSettings } from "@/features/organization/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import type { ShiftDisplayMode } from "@/types";

interface ScheduleStepProps {
  onNext: () => void;
  onBack: () => void;
}

/**
 * Schedule = display mode + shift categories + jobs on one screen.
 * Replaces DisplayModeStep, ShiftsStep, JobsStep.
 */
export default function ScheduleStep({ onNext, onBack }: ScheduleStepProps) {
  const {
    org,
    shiftCategories,
    focusAreas,
    jobs,
    orgRoles,
    certifications,
    departments,
    setOrg,
    setShiftCategories,
    setJobs,
  } = useOrganizationData({ includeAssignmentDefinitionCompatibility: false });

  const [selectedMode, setSelectedMode] = useState<ShiftDisplayMode>(
    org?.shiftDisplayMode ?? "code",
  );
  const [savingMode, setSavingMode] = useState(false);

  const saveDisplayMode = useCallback(async () => {
    if (!org) return true;
    if (selectedMode === org.shiftDisplayMode) return true;
    setSavingMode(true);
    try {
      if (!org.updatedAt) {
        throw new Error("Organization settings are out of date. Refresh and try again.");
      }
      const saved = await updateOrganizationSettings({
        orgId: org.id,
        expectedUpdatedAt: org.updatedAt,
        shiftDisplayMode: selectedMode,
      });
      setOrg({ ...org, shiftDisplayMode: selectedMode, updatedAt: saved.updatedAt });
      return true;
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Failed to save display mode");
      return false;
    } finally {
      setSavingMode(false);
    }
  }, [org, selectedMode, setOrg]);

  const handleNext = useCallback(async () => {
    const ok = await saveDisplayMode();
    if (ok) onNext();
  }, [saveDisplayMode, onNext]);

  if (!org) return null;

  const hasCategories = shiftCategories.length > 0;
  const hasJobs = jobs.length > 0;

  return (
    <StepLayout
      title="Schedule"
      description="Pick how shifts display, define your shift blocks, then place the jobs that need staffing."
      onNext={handleNext}
      onBack={onBack}
      nextDisabled={savingMode || !hasCategories || !hasJobs}
      nextLoading={savingMode}
      wide
    >
      <CompositeSection title="Display mode" description="How shifts appear on the schedule grid.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {DISPLAY_MODES.map((mode) => {
            const isActive = selectedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSelectedMode(mode.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 16,
                  borderRadius: "var(--dg-radius-md)",
                  border: isActive
                    ? "2px solid var(--color-brand)"
                    : "1px solid var(--color-border)",
                  background: isActive
                    ? "var(--color-brand-bg, rgba(59,130,246,0.06))"
                    : "var(--color-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 150ms ease, background 150ms ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: isActive
                        ? "2px solid var(--color-brand)"
                        : "2px solid var(--color-border-strong, #94a3b8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isActive && (
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "var(--color-brand)",
                        }}
                      />
                    )}
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {mode.title}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {mode.description}
                </p>
                <DisplayModeSample mode={mode.id} shiftCategories={shiftCategories} jobs={jobs} />
              </button>
            );
          })}
        </div>
      </CompositeSection>

      <CompositeSection
        title="Shifts"
        description="Core shift blocks inside each focus area. Day, Evening, Night, etc."
      >
        <ShiftCategoriesSettings
          shiftCategories={shiftCategories}
          focusAreas={focusAreas}
          orgId={org.id}
          onChange={setShiftCategories}
          canManageScheduleDefinitions={true}
        />
      </CompositeSection>

      <CompositeSection
        title="Jobs"
        description="Responsibilities like Supervisor, Mentor, Nurse. Placed on the departments, focus areas, and shifts where they should appear."
      >
        <JobsSettings
          jobs={jobs}
          orgId={org.id}
          orgRoles={orgRoles}
          certifications={certifications}
          departments={departments}
          focusAreas={focusAreas}
          shiftCategories={shiftCategories}
          roleLabel={org.roleLabel || "Roles"}
          certificationLabel={org.certificationLabel || "Certifications"}
          onChange={setJobs}
          canManageScheduleDefinitions={true}
          shiftDisplayMode={org.shiftDisplayMode}
        />
      </CompositeSection>

      {(!hasCategories || !hasJobs) && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          {!hasCategories
            ? "Add at least one shift to continue."
            : "Add at least one job to continue."}
        </p>
      )}
    </StepLayout>
  );
}
