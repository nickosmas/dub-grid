import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardHero from "@/components/dashboard/DashboardHero";
import { DirectoryCertificationCards } from "@/components/staff/DirectoryCertificationCards";

/**
 * jsdom computes no layout, so equal heights themselves are proven in the
 * browser by e2e/stat-cards.spec.ts. This is the cheap canary for the one
 * mechanism that keeps breaking them: an interactive wrapper between the grid
 * track and the card, absorbing the stretch the card never passes on.
 */

describe("stat card stretch", () => {
  it("keeps a linked hero tile filling its grid track", () => {
    render(
      <DashboardHero
        headline="19 projected overtime alerts"
        description="Adjust hours or staffing to avoid overtime this period."
        actionLabel="Review OT alerts"
        actionHref="/schedule"
        metrics={[
          { label: "Coverage", value: "—", detail: "Not configured", href: "/schedule" },
          { label: "Draft shifts", value: "0", href: "/schedule" },
        ]}
      />,
    );

    const tiles = document.querySelectorAll<HTMLElement>("[data-stat-card]");
    expect(tiles).toHaveLength(2);

    for (const tile of tiles) {
      expect(tile.style.height).toBe("100%");
      // The Link is the grid child; if it does not stretch there is no height
      // for the card's own 100% to resolve against.
      // Grid stretch already sizes the Link, so this is belt-and-braces: it
      // keeps the tile filling its row even if the track stops being a grid.
      const link = tile.closest("a");
      expect(link).not.toBeNull();
      expect(link?.style.height).toBe("100%");
    }
  });

  it("does not let the certification tile button impose a control height", () => {
    render(
      <DirectoryCertificationCards
        counts={[{ certificationId: 1, count: 4 }]}
        certifications={[
          { id: 1, orgId: "org-1", name: "Certified Nursing Assistant", abbr: "CNA", sortOrder: 0 },
        ]}
        certificationLabel="Certification"
        certifiedCount={4}
        uncertifiedCount={2}
        selectedCertification={null}
        onSelectCertification={() => {}}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(1);

    for (const button of buttons) {
      // A default-size Button ships h-[var(--dg-btn-h-lg)] and centers its
      // child; both would strand the card at content height inside a taller row.
      expect(button.className).toContain("h-auto");
      expect(button.className).toContain("items-stretch");
    }

    for (const tile of document.querySelectorAll<HTMLElement>("[data-stat-card]")) {
      expect(tile.className).toContain("h-full");
    }
  });
});
