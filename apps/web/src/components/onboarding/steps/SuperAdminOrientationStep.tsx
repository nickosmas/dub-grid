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
    desc: "Real-time coverage metrics, staffing overview, and quick actions all in one place.",
  },
  {
    icon: <ScheduleIcon size={22} />,
    name: "Schedule",
    desc: "Build, publish, and manage schedules with conflict prevention and recurring templates.",
  },
  {
    icon: <PeopleIcon size={22} />,
    name: "People",
    desc: "Manage employees, send invitations, assign roles, and track certifications.",
  },
  {
    icon: <SettingsIcon size={22} />,
    name: "Settings",
    desc: "Review and configure departments, shifts, jobs, roles, and all organization options.",
  },
  {
    icon: <ShieldIcon size={22} />,
    name: "Admin Management",
    desc: "Invite admins, configure granular permissions, and delegate access across your organization.",
  },
];

export default function SuperAdminOrientationStep({
  onNext,
  onBack,
}: SuperAdminOrientationStepProps) {
  return (
    <StepLayout
      title="Getting Around as a Super Admin"
      description="Here's a quick overview of everything you have access to."
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
              background: "var(--color-surface)",
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "var(--dg-radius-md)",
                background: "var(--color-brand-bg, #eff6ff)",
                color: "var(--color-brand)",
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
                  color: "var(--color-text-primary)",
                  marginBottom: 3,
                }}
              >
                {s.name}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-text-muted)",
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
