import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoverageRequirementsSettings from "@/components/settings/Coverage";
import DepartmentsSettings from "@/components/settings/DepartmentsSettings";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import {
  makeCoverageRequirement,
  makeDepartment,
  makeFocusArea,
  makeShiftCategory,
} from "./factories";
import type { JobDefinition } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings",
}));

vi.mock("@/features/settings/client", () => ({
  saveCoverageRequirements: vi.fn(),
  saveDepartments: vi.fn(),
  upsertFocusArea: vi.fn(),
  deleteFocusArea: vi.fn(),
  checkDepartmentDependencies: vi.fn(),
  checkFocusAreaDependencies: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks", () => ({
  useMediaQuery: () => false,
  useEmployeeCount: () => ({ employeeCount: 42, loading: false }),
  MOBILE: "(max-width: 767px)",
}));

/** Stands in for the settings sidebar's `<Link href="/settings?section=..." replace>`. */
const navigate = vi.fn();

function renderCoverageWithSidebar() {
  const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
  const shiftCategory = makeShiftCategory({
    id: 10,
    orgId: "org-1",
    name: "Days",
    focusAreaId: 1,
  });
  const job: JobDefinition = {
    id: 200,
    orgId: "org-1",
    name: "Supervisor",
    abbr: "SUP",
    showOnGrid: true,
    focusAreaId: 1,
    applicableShiftIds: [10],
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#bfdbfe",
    border: "#1d4ed8",
    text: "#1d4ed8",
    sortOrder: 1,
    assignmentMode: "with_shift",
    systemKey: null,
    archivedAt: null,
  };
  const requirement = makeCoverageRequirement({
    id: 50,
    orgId: "org-1",
    focusAreaId: 1,
    jobId: 200,
    preferredShiftId: 10,
    assignmentId: 100,
    minStaff: 2,
  });

  return render(
    <NavigationGuardProvider>
      <a
        href="/settings?section=jobs"
        onClick={(event) => {
          event.preventDefault();
          navigate();
        }}
      >
        Jobs
      </a>
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        jobs={[job]}
        coverageRequirements={[requirement]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />
    </NavigationGuardProvider>,
  );
}

async function dirtyTheCoveragePanel(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen
    .getAllByRole("button")
    .find((button) => button.getAttribute("aria-expanded") === "false");
  await user.click(toggle!);

  const staffInput = await screen.findByRole("spinbutton");
  await user.clear(staffInput);
  await user.type(staffInput, "3");
  // The Discard button only appears once the panel is genuinely dirty, so it
  // doubles as the precondition for everything below.
  expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
}

function renderDepartmentsWithSidebar() {
  const department = makeDepartment({
    id: 1,
    orgId: "org-1",
    name: "Emergency",
    type: "scheduled",
  });
  const focusArea = makeFocusArea({
    id: 1,
    orgId: "org-1",
    name: "ICU",
    departmentId: 1,
  });

  return render(
    <NavigationGuardProvider>
      <a
        href="/settings?section=jobs"
        onClick={(event) => {
          event.preventDefault();
          navigate();
        }}
      >
        Jobs
      </a>
      <DepartmentsSettings
        orgId="org-1"
        departments={[department]}
        focusAreas={[focusArea]}
        focusAreaLabel="Focus Areas"
        departmentLabel="Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />
    </NavigationGuardProvider>,
  );
}

beforeEach(() => {
  navigate.mockReset();
});

describe("settings panels guard navigation", () => {
  it("asks before a sidebar click discards coverage edits", async () => {
    const user = userEvent.setup();
    renderCoverageWithSidebar();
    await dirtyTheCoveragePanel(user);
    const staffInput = screen.getByRole("spinbutton");

    await user.click(screen.getByRole("link", { name: "Jobs" }));

    const dialog = screen.getByRole("dialog", { name: "Unsaved changes" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(navigate).not.toHaveBeenCalled();
    // Opening the confirmation preserves the draft in the underlying panel.
    expect(staffInput).toHaveValue("3");
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });

  it("keeps the edit when the user chooses to stay", async () => {
    const user = userEvent.setup();
    renderCoverageWithSidebar();
    await dirtyTheCoveragePanel(user);

    await user.click(screen.getByRole("link", { name: "Jobs" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton")).toHaveValue("3");
  });

  it("leaves once the discard is confirmed", async () => {
    const user = userEvent.setup();
    renderCoverageWithSidebar();
    await dirtyTheCoveragePanel(user);

    await user.click(screen.getByRole("link", { name: "Jobs" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Unsaved changes" })).getByRole("button", {
        name: "Discard",
      }),
    );

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("does not ask while the panel is untouched", async () => {
    const user = userEvent.setup();
    renderCoverageWithSidebar();

    await user.click(screen.getByRole("link", { name: "Jobs" }));

    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  // Regression: the departments draft stays empty until the user enters edit
  // mode, so an ungated dirty check compared `[]` against the real rows and
  // prompted on every populated departments page the user merely visited.
  it("does not ask when leaving an untouched departments panel", async () => {
    const user = userEvent.setup();
    renderDepartmentsWithSidebar();
    expect(screen.getByText("Emergency")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Jobs" }));

    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("still asks once a department has actually been edited", async () => {
    const user = userEvent.setup();
    renderDepartmentsWithSidebar();

    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    const nameInput = screen.getByDisplayValue("Emergency");
    await user.type(nameInput, " Room");

    await user.click(screen.getByRole("link", { name: "Jobs" }));

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
