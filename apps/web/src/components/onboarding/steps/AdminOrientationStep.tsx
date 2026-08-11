"use client";

import StepLayout from "../StepLayout";
import { DashboardIcon, ScheduleIcon, PeopleIcon, SettingsIcon } from "@/components/icons/NavIcons";

interface AdminOrientationStepProps {
  onNext: () => void;
  onBack: () => void;
}

const sections = [
  {
    icon: <DashboardIcon size={22} />,
    name: "Dashboard",
    desc: "Your home base \u2014 see coverage status, shift summaries, and quick actions at a glance.",
  },
  {
    icon: <ScheduleIcon size={22} />,
    name: "Schedule",
    desc: "The schedule grid where you view, edit, and publish shifts for your team.",
  },
  {
    icon: <PeopleIcon size={22} />,
    name: "People",
    desc: "Manage employees, view the directory, send invitations, and track certifications.",
  },
  {
    icon: <SettingsIcon size={22} />,
    name: "Settings",
    desc: "Configure departments, shifts, jobs, roles, and other organization options.",
  },
];

export default function AdminOrientationStep({ onNext, onBack }: AdminOrientationStepProps) {
  return (
    <StepLayout
      title="Getting Around"
      description="Here's a quick overview of the main sections you'll be working with."
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
