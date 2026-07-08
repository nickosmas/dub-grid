"use client";

import { ExternalLink } from "lucide-react";

import { SectionCard } from "@/components/settings/shared";
import { openConsentPreferences } from "@/components/CookieConsent";

interface PolicyLink {
  href: string;
  label: string;
  description: string;
}

const POLICY_LINKS: PolicyLink[] = [
  {
    href: "/privacy",
    label: "Privacy policy",
    description: "What we collect, why we collect it, and how we use it.",
  },
  {
    href: "/terms",
    label: "Terms of service",
    description: "The agreement that covers your use of DubGrid.",
  },
  {
    href: "/cookie-policy",
    label: "Cookie policy",
    description: "Which cookies DubGrid sets and what each one does.",
  },
];

export function DataPrivacyPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Cookie preferences
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              Adjust which cookies and analytics DubGrid uses on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={openConsentPreferences}
            className="dg-btn dg-btn-secondary self-start"
          >
            Manage cookie preferences
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Policies
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              The legal documents that govern your use of DubGrid.
            </p>
          </div>
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {POLICY_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] no-underline transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="font-medium">{link.label}</span>
                    <span className="text-[12px] text-[var(--color-text-muted)]">
                      {link.description}
                    </span>
                  </span>
                  <ExternalLink
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-text-muted)]"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
