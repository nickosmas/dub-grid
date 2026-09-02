import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StringListSettings, {
  getTwoRowRequirementFit,
} from "@/components/settings/StringListSettings";
import type { Department, NamedItem } from "@/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dept = (id: number, name: string, sortOrder: number): Department => ({
  id,
  orgId: "org-1",
  name,
  abbr: name.slice(0, 3).toUpperCase(),
  type: "scheduled",
  sortOrder,
});

const NURSING = dept(1, "Nursing", 0);
const EMERGENCY = dept(2, "Emergency", 1);
const OUTPATIENT = dept(3, "Outpatient", 2);

const rn = (departmentIds: number[] = []): NamedItem => ({
  id: 1,
  orgId: "org-1",
  name: "RN",
  abbr: "RN",
  sortOrder: 0,
  departmentIds,
});

const lpn = (): NamedItem => ({
  id: 2,
  orgId: "org-1",
  name: "LPN",
  abbr: "LPN",
  sortOrder: 1,
});

const cna = (): NamedItem => ({
  id: 3,
  orgId: "org-1",
  name: "CNA",
  abbr: "CNA",
  sortOrder: 2,
});

const md = (): NamedItem => ({
  id: 4,
  orgId: "org-1",
  name: "MD",
  abbr: "MD",
  sortOrder: 3,
});

/** Three departments by default, so a multi-selection stays a genuine subset. */
function renderCertifications(items: NamedItem[], departments = [NURSING, EMERGENCY, OUTPATIENT]) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <StringListSettings
      label="Certifications"
      items={items}
      onSave={onSave}
      placeholder="Certification"
      departments={departments}
      initialEditing
    />,
  );
  return onSave;
}

function renderNameFirstCertifications(items: NamedItem[]) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <StringListSettings
      label="Certifications"
      items={items}
      onSave={onSave}
      placeholder="Certification"
      hideAbbr
      initialEditing
    />,
  );
  return onSave;
}

const savedItem = (onSave: ReturnType<typeof vi.fn>) => onSave.mock.calls[0]![0][0];

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

const click = (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) =>
  user.click(screen.getByRole("button", { name }));

describe("StringListSettings — department assignment", () => {
  // The reported bug: a credential could only ever belong to one department, so
  // an RN covering two units had no way to say so.
  it("lets one certification belong to several departments", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id])]);

    await click(user, "Emergency");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [NURSING.id, EMERGENCY.id] });
  });

  it("marks the departments an item already belongs to as selected", () => {
    renderCertifications([rn([EMERGENCY.id])]);

    expect(pressed("Emergency")).toBe("true");
    expect(pressed("Nursing")).toBe("false");
  });

  it("uses the shared rounded selectable-pill treatment for departments", () => {
    renderCertifications([rn([NURSING.id])]);

    const selected = screen.getByRole("button", { name: "Nursing" });
    const unselected = screen.getByRole("button", { name: "Emergency" });
    expect(selected).toHaveStyle({
      background: "var(--dg-color-brand)",
      color: "var(--dg-color-text-inverse)",
      borderRadius: "999px",
    });
    expect(unselected).toHaveStyle({
      background: "var(--dg-color-surface)",
      color: "var(--dg-color-text-secondary)",
      borderRadius: "999px",
    });
  });

  it("deselects a department when toggled off", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id, EMERGENCY.id])]);

    await click(user, "Nursing");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [EMERGENCY.id] });
  });

  // Selecting no department is how an org says a credential isn't tied to one,
  // which is a real state (an MD, or a catch-all), not missing data.
  it("clears every department back to org-wide", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id, EMERGENCY.id])]);

    await click(user, "Org-wide");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [] });
  });

  it("shows Org-wide as selected when no department is set", () => {
    renderCertifications([rn([])]);

    expect(pressed("Org-wide")).toBe("true");
  });

  it("preserves all current departments as distinct from org-wide", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id, EMERGENCY.id])]);

    await click(user, "Outpatient");

    expect(pressed("Org-wide")).toBe("false");
    expect(pressed("Nursing")).toBe("true");
    expect(pressed("Emergency")).toBe("true");
    expect(pressed("Outpatient")).toBe("true");

    await click(user, /^save$/i);
    expect(savedItem(onSave)).toMatchObject({
      departmentIds: [NURSING.id, EMERGENCY.id, OUTPATIENT.id],
    });
  });

  it("preserves all current departments in a two-department organization", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id])], [NURSING, EMERGENCY]);

    await click(user, "Emergency");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [NURSING.id, EMERGENCY.id] });
  });

  it("preserves the only current department as an explicit scope", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([])], [NURSING]);

    await click(user, "Nursing");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [NURSING.id] });
  });

  it("does not convert a saved all-current-departments scope to org-wide", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id, EMERGENCY.id, OUTPATIENT.id])]);

    await user.type(screen.getByPlaceholderText("Full name"), "x");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({
      departmentIds: [NURSING.id, EMERGENCY.id, OUTPATIENT.id],
    });
  });

  it("moves a row with its keyboard reorder control", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn(), lpn()]);

    const handle = screen.getByRole("button", { name: /reorder lpn/i });
    handle.focus();
    await user.keyboard("{ArrowUp}");
    await click(user, /^save$/i);

    expect(onSave).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: "LPN", sortOrder: 0 }),
        expect.objectContaining({ name: "RN", sortOrder: 1 }),
      ],
      [],
    );
  });
});

describe("StringListSettings — name-first compact labels", () => {
  it("keeps compact labels hidden until the user explicitly customizes them", async () => {
    const user = userEvent.setup();
    const onSave = renderNameFirstCertifications([{ ...rn(), name: "Charge Nurse", abbr: "CN" }]);

    expect(screen.queryByPlaceholderText("Abbreviation")).not.toBeInTheDocument();

    await click(user, /customize compact labels/i);
    const compactLabel = screen.getByPlaceholderText("Abbreviation");
    expect(compactLabel).toHaveValue("CN");

    await user.clear(compactLabel);
    await user.type(compactLabel, "LEAD");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ name: "Charge Nurse", abbr: "LEAD" });
  });

  it("can return a custom compact label to its automatic value", async () => {
    const user = userEvent.setup();
    const onSave = renderNameFirstCertifications([{ ...rn(), name: "Charge Nurse", abbr: "LEAD" }]);

    await click(user, /customize compact labels/i);
    await click(user, /use automatic/i);

    const automaticCell = screen.getByLabelText("Compact label for Charge Nurse");
    expect(automaticCell).toHaveValue("");
    expect(automaticCell).toHaveAttribute("placeholder", "Abbreviation");
    expect(screen.getByRole("button", { name: "Using automatic: CN" })).toBeDisabled();
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ name: "Charge Nurse", abbr: "CN" });
  });
});

describe("StringListSettings — role certification requirements", () => {
  it("fills the available two rows before introducing overflow", () => {
    expect(
      getTwoRowRequirementFit({
        containerWidth: 400,
        pillWidths: [240, 40, 150],
        overflowWidths: new Map([
          [1, 60],
          [2, 60],
        ]),
      }),
    ).toBe(3);

    expect(
      getTwoRowRequirementFit({
        containerWidth: 240,
        pillWidths: [190, 160, 100],
        overflowWidths: new Map([
          [1, 60],
          [2, 60],
        ]),
      }),
    ).toBe(2);
  });

  it("uses rounded selectable tags and preserves all certifications as certified-only", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <StringListSettings
        label="Roles"
        items={[
          {
            id: 10,
            orgId: "org-1",
            name: "Charge nurse",
            abbr: "CN",
            sortOrder: 0,
            requiredCertificationIds: [rn().id],
          },
        ]}
        onSave={onSave}
        placeholder="Role"
        certifications={[rn(), lpn()]}
        showRequiredCertifications
        initialEditing
      />,
    );

    const anyone = screen.getByRole("button", { name: "Anyone" });
    const selectedCertification = screen.getByRole("button", { name: "RN" });
    const unselectedCertification = screen.getByRole("button", { name: "LPN" });

    expect(anyone).toHaveStyle({
      background: "var(--dg-color-surface)",
      color: "var(--dg-color-text-secondary)",
      borderRadius: "999px",
    });
    expect(selectedCertification).toHaveStyle({
      background: "var(--dg-color-brand)",
      color: "var(--dg-color-text-inverse)",
      borderRadius: "999px",
    });
    expect(unselectedCertification.style.border).toBe("1.5px solid var(--dg-color-border)");

    await user.click(unselectedCertification);
    expect(anyone).toHaveAttribute("aria-pressed", "false");
    expect(selectedCertification).toHaveAttribute("aria-pressed", "true");
    expect(unselectedCertification).toHaveAttribute("aria-pressed", "true");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ requiredCertificationIds: [rn().id, lpn().id] });
  });

  it("uses compact two-row category pills with a tooltip-backed overflow in view mode", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StringListSettings
        label="Roles"
        items={[
          {
            id: 10,
            orgId: "org-1",
            name: "Charge nurse",
            abbr: "CN",
            sortOrder: 0,
            isScheduleRole: true,
            departmentIds: [NURSING.id],
            requiredCertificationIds: [rn().id, lpn().id, cna().id],
          },
        ]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        placeholder="Role"
        hideAbbr
        departments={[NURSING, EMERGENCY]}
        showScheduleRoleToggle
        certifications={[rn(), lpn(), cna(), md()]}
        showRequiredCertifications
      />,
    );

    const visiblePills = container.querySelectorAll(
      '.dg-role-requirement-view-pill[data-status-pill-variant="category"]',
    );
    expect(visiblePills).toHaveLength(2);
    expect(visiblePills[0]).toHaveTextContent("RN");
    expect(visiblePills[1]).toHaveTextContent("LPN");

    const overflow = screen.getByRole("button", { name: "1 more requirements: CNA" });
    expect(overflow).toHaveTextContent("+1 more");
    await user.hover(overflow);
    expect(
      await screen.findByText("CNA", { selector: '[data-slot="tooltip-content"]' }),
    ).toBeVisible();

    const row = container.querySelector<HTMLElement>(".dg-settings-reorder-item");
    expect(row).not.toBeNull();
    expect(row!.style.gridTemplateColumns).toContain("minmax(0, 1.25fr)");
    expect(row!.style.gridTemplateColumns).toContain("minmax(0, 1fr)");
    expect(row!.style.gridTemplateColumns).toContain("minmax(0, 0.75fr)");
    expect(row!.style.gridTemplateColumns).toContain("minmax(0, 2fr)");
    expect(row!.style.minWidth).toBe("");
    expect(row!.parentElement?.style.overflowX).toBe("");
  });

  it("uses the same compact category-pill treatment for role names in view mode", () => {
    const { container } = render(
      <StringListSettings
        label="Roles"
        items={[
          {
            id: 10,
            orgId: "org-1",
            name: "Director of Christian Science Nursing",
            abbr: "Director",
            sortOrder: 0,
            isScheduleRole: true,
          },
        ]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        placeholder="Role"
        hideAbbr
        showScheduleRoleToggle
      />,
    );

    const roleName = container.querySelector<HTMLElement>(
      '.dg-role-name-view-pill[data-status-pill-variant="category"]',
    );
    expect(roleName).toHaveTextContent("Director of Christian Science Nursing");
    expect(roleName).toHaveClass("max-w-full", "whitespace-normal");
  });

  it("keeps long visible requirements complete rather than truncating them", () => {
    const longRequirement = {
      ...rn(),
      name: "Journal Listed Christian Science Nurse",
    };
    const { container } = render(
      <StringListSettings
        label="Roles"
        items={[
          {
            id: 10,
            orgId: "org-1",
            name: "Charge nurse",
            abbr: "CN",
            sortOrder: 0,
            requiredCertificationIds: [longRequirement.id, lpn().id, cna().id],
          },
        ]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        placeholder="Role"
        hideAbbr
        certifications={[longRequirement, lpn(), cna(), md()]}
        showRequiredCertifications
      />,
    );

    const visiblePills = container.querySelectorAll(
      '.dg-role-requirement-view-pill[data-status-pill-variant="category"]',
    );
    expect(visiblePills).toHaveLength(2);
    expect(visiblePills[0]).toHaveTextContent("Journal Listed Christian Science Nurse");
    expect(visiblePills[0]?.querySelector(".dg-role-requirement-pill-label")).toHaveTextContent(
      "Journal Listed Christian Science Nurse",
    );
    expect(screen.getByRole("button", { name: "1 more requirements: CNA" })).toHaveTextContent(
      "+1 more",
    );
  });

  it("shows schedule eligibility as Yes or No in view mode", () => {
    render(
      <StringListSettings
        label="Roles"
        items={[
          {
            id: 10,
            orgId: "org-1",
            name: "Schedule role",
            abbr: "SR",
            sortOrder: 0,
            isScheduleRole: true,
          },
          {
            id: 11,
            orgId: "org-1",
            name: "Display role",
            abbr: "DR",
            sortOrder: 1,
            isScheduleRole: false,
          },
        ]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        placeholder="Role"
        hideAbbr
        showScheduleRoleToggle
      />,
    );

    expect(screen.getByText("Yes", { exact: true })).toBeVisible();
    expect(screen.getByText("No", { exact: true })).toBeVisible();
    expect(screen.queryByText("Schedule eligible", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Cosmetic only", { exact: true })).not.toBeInTheDocument();
  });
});
