"use client";

import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { useOrganizationData } from "@/hooks";
import {
  CalendarDays,
  Users,
  LayoutDashboard,
  Shield,
} from "lucide-react";

interface WelcomeStepProps {
  role: string;
  onNext: () => void;
  isOrgSetup?: boolean;
}

const featureCards: Record<
  string,
  { icon: React.ReactNode; title: string; desc: string }[]
> = {
  super_admin: [
    {
      icon: <LayoutDashboard size={20} />,
      title: "Dashboard & Insights",
      desc: "Real-time coverage, staffing metrics, and scheduling overview",
    },
    {
      icon: <CalendarDays size={20} />,
      title: "Smart Scheduling",
      desc: "Build, publish, and manage schedules with conflict prevention",
    },
    {
      icon: <Users size={20} />,
      title: "Staff Management",
      desc: "Manage employees, certifications, roles, and departments",
    },
    {
      icon: <Shield size={20} />,
      title: "Full Control",
      desc: "Configure every aspect of your workspace and delegate permissions",
    },
  ],
  admin: [
    {
      icon: <CalendarDays size={20} />,
      title: "Schedule Management",
      desc: "View and edit schedules based on your assigned permissions",
    },
    {
      icon: <Users size={20} />,
      title: "Team Overview",
      desc: "See your team, manage employees, and track staffing",
    },
    {
      icon: <LayoutDashboard size={20} />,
      title: "Dashboard",
      desc: "Coverage gaps, shift summaries, and quick actions at a glance",
    },
  ],
  user: [
    {
      icon: <CalendarDays size={20} />,
      title: "Your Schedule",
      desc: "View your upcoming shifts, request changes, and stay informed",
    },
    {
      icon: <Users size={20} />,
      title: "Your Team",
      desc: "See who you're working with and facility staffing",
    },
  ],
};

export default function WelcomeStep({ role, onNext, isOrgSetup }: WelcomeStepProps) {
  const { org } = useOrganizationData();
  const orgName = org?.name;

  const isSuperAdmin = role === "super_admin";
  const isSaOrientation = isSuperAdmin && (isOrgSetup ?? false);
  const features = featureCards[role] ?? featureCards.user;

  const heading = isSaOrientation
    ? `Welcome to ${orgName ?? "DubGrid"}`
    : isSuperAdmin
      ? "Welcome to DubGrid"
      : `Welcome to ${orgName ?? "DubGrid"}`;

  const subtext = isSaOrientation
    ? "You\u2019ve been added as a super admin. Let\u2019s take a quick look at what you can do."
    : isSuperAdmin
      ? "Smart staff scheduling built for care facilities. Let\u2019s set up your workspace \u2014 it only takes a few minutes."
      : role === "admin"
        ? "You\u2019ve been added as an administrator. Here\u2019s what you\u2019ll have access to."
        : "You\u2019re all set up and ready to go. Here\u2019s what you\u2019ll find here.";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <DubGridLogo size={52} />
        <DubGridWordmark />
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "var(--color-text-primary)",
          margin: "0 0 12px",
          letterSpacing: "-0.03em",
        }}
      >
        {heading}
      </h1>
      <p
        style={{
          fontSize: 16,
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
          margin: "0 0 36px",
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {subtext}
      </p>

      {/* Feature cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: features.length <= 2 ? "1fr" : "1fr 1fr",
          gap: 12,
          marginBottom: 36,
          textAlign: "left",
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              padding: "16px 18px",
              background: "var(--color-bg-card, white)",
              borderRadius: 14,
              border: "1px solid var(--color-border)",
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--color-brand-bg, #eff6ff)",
                color: "var(--color-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {f.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: 2,
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                  lineHeight: 1.4,
                }}
              >
                {f.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onNext}
        type="button"
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "14px 24px",
          borderRadius: 12,
          border: "none",
          background: "var(--color-brand)",
          color: "var(--color-text-inverse)",
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          transition: "transform 150ms ease, box-shadow 150ms ease",
          boxShadow: "0 4px 16px rgba(37, 99, 235, 0.25)",
        }}
      >
        {isSuperAdmin && !isOrgSetup ? "Let\u2019s Get Started" : "Continue"}
      </button>
    </div>
  );
}
