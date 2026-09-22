import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActivityDetailsDialog } from "@/components/settings/ActivityLog";
import type { FullAuditLogEntry } from "@/types";

const entry: FullAuditLogEntry = {
  id: 1,
  orgId: "org-1",
  orgName: "Calm Haven",
  actorId: "actor-1",
  actorEmail: "nickosmas@outlook.com",
  actorName: "Nic Kosmas",
  action: "shift.updated",
  resourceType: "shift",
  resourceId: "employee-1:2026-09-05",
  targetLabel: "Shift",
  targetEmail: null,
  details: {
    input: {
      kind: "worked",
      segments: [],
    },
  },
  createdAt: "2026-09-02T10:21:00.000Z",
};

describe("ActivityDetailsDialog", () => {
  it("uses a compact hierarchy and separates primary identity from supporting email", () => {
    render(<ActivityDetailsDialog entry={entry} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Activity details" });
    expect(dialog).toHaveClass("dg-activity-details-modal");

    const headline = within(dialog).getByText("Changed a shift on Sep 5, 2026");
    expect(headline).toHaveClass("dg-activity-details-headline");

    const categoryBadge = dialog.querySelector('[data-status-pill-variant="category"]');
    expect(categoryBadge).toHaveTextContent("Schedule");
    expect(categoryBadge?.parentElement).toHaveClass("dg-activity-details-summary");

    expect(within(dialog).getByText("Nic Kosmas")).toHaveClass(
      "dg-activity-details-identity-primary",
    );
    expect(within(dialog).getByText("nickosmas@outlook.com")).toHaveClass(
      "dg-activity-details-identity-secondary",
    );
    expect(
      within(dialog).queryByText("Nic Kosmas (nickosmas@outlook.com)"),
    ).not.toBeInTheDocument();

    expect(within(dialog).getByText("Target changed")).toBeInTheDocument();
    expect(within(dialog).getByText("Activity type")).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "What changed" })).toHaveClass(
      "dg-activity-details-changes",
    );
    expect(within(dialog).getByText("Working")).toHaveClass("dg-activity-details-value");
  });

  it("binds the hierarchy to shared type roles and keeps narrow layouts readable", () => {
    const css =
      readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8") +
      readFileSync(path.resolve(__dirname, "../../../app/app-ui.css"), "utf8");

    expect(css).toMatch(/\.dg-activity-details-summary\s*\{[\s\S]*?align-items:\s*flex-start;/);
    expect(css).toMatch(
      /\.dg-activity-details-headline\s*\{[\s\S]*?font-size:\s*var\(--dg-type-component-heading-size\);/,
    );
    expect(css).toMatch(
      /\.dg-activity-details-label\s*\{[\s\S]*?font-weight:\s*var\(--dg-type-field-title-weight\);/,
    );
    expect(css).toMatch(
      /\.dg-activity-details-value\s*\{[\s\S]*?font-weight:\s*var\(--dg-type-body-weight\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 480px\)\s*\{[\s\S]*?\.dg-activity-details-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });
});
