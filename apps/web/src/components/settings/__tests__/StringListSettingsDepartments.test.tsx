import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StringListSettings from "@/components/settings/StringListSettings";
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

  // Selecting every department says the same thing as org-wide, and org-wide
  // also covers departments added later, which is what "all of them" means.
  it("collapses to org-wide once every department is selected", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id, EMERGENCY.id])]);

    await click(user, "Outpatient");

    expect(pressed("Org-wide")).toBe("true");
    expect(pressed("Nursing")).toBe("false");

    await click(user, /^save$/i);
    expect(savedItem(onSave)).toMatchObject({ departmentIds: [] });
  });

  it("collapses in a two-department org as soon as both are selected", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id])], [NURSING, EMERGENCY]);

    await click(user, "Emergency");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [] });
  });

  // With one department, "all" and "that one" are the same set, so collapsing
  // would leave the picker unable to express any scoping at all.
  it("does not collapse when the org has a single department", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([])], [NURSING]);

    await click(user, "Nursing");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [NURSING.id] });
  });

  // Rows saved before the rule existed shouldn't keep a second spelling of
  // org-wide, so the collapse also runs on save, not only on toggle.
  it("normalizes an all-departments row on save even when untouched", async () => {
    const user = userEvent.setup();
    const onSave = renderCertifications([rn([NURSING.id, EMERGENCY.id, OUTPATIENT.id])]);

    await user.type(screen.getByPlaceholderText("Full name"), "x");
    await click(user, /^save$/i);

    expect(savedItem(onSave)).toMatchObject({ departmentIds: [] });
  });
});
