"use client";

import StepLayout from "../StepLayout";
import {
  DashboardIcon,
  ScheduleIcon,
  PeopleIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/icons/NavIcons";

interface SuperAdminOrientationStepProps {
  onNext: () => void;
  onBack: () => void;
}

const sections = [
  {
    icon: <DashboardIcon size={22} />,
    name: "Dashboard & Insights",
    desc: "Coverage, staffing, and shortcuts for today.",
  },
  {
    icon: <ScheduleIcon size={22} />,
    name: "Schedule",
    desc: "Build and publish schedules, with recurring schedules and overlap checks.",
  },
  {
    icon: <PeopleIcon size={22} />,
    name: "People",
    desc: "Your staff directory, invitations, and each person's details.",
  },
  {
    icon: <SettingsIcon size={22} />,
    name: "Settings",
    desc: "Departments, shifts, jobs, and how your organization works.",
  },
  {
    icon: <ShieldIcon size={22} />,
    name: "Admin Management",
    desc: "Invite Admins and choose what each one can do.",
  },
];

export default function SuperAdminOrientationStep({
  onNext,
  onBack,
}: SuperAdminOrientationStepProps) {
  return (
    <StepLayout
      title="Getting around as a Super Admin"
      description="The main pages you'll use."
      onNext={onNext}
      onBack={onBack}
      nextLabel="Continue"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sections.map((s) => (
          <div
            key={s.name}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              padding: "16px 20px",
              background: "var(--dg-color-surface)",
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--dg-color-border)",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "var(--dg-radius-md)",
                background: "var(--dg-color-brand-bg, #eff6ff)",
                color: "var(--dg-color-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {s.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                  marginBottom: 3,
                }}
              >
                {s.name}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--dg-color-text-muted)",
                  lineHeight: 1.5,
                }}
              >
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </StepLayout>
  );
}
