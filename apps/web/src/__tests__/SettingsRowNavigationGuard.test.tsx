import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AbsenceTypesSettings from "@/components/settings/AbsenceTypes";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { upsertAbsenceType } from "@/features/settings/client";
import type { AbsenceType } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/features/settings/client", () => ({
  upsertAbsenceType: vi.fn(),
  deleteAbsenceType: vi.fn(),
  checkAbsenceTypeDependencies: vi.fn(),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks", () => ({ useMediaQuery: () => false, MOBILE: "(max-width: 767px)" }));

const vacation: AbsenceType = {
  id: 7,
  orgId: "org-1",
  label: "V",
  name: "Vacation",
  color: "#fde68a",
  border: "#f59e0b",
  text: "#92400e",
  sortOrder: 1,
};

const navigate = vi.fn();

function renderRow() {
  render(
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
      <AbsenceTypesSettings
        absenceTypes={[vacation]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />
    </NavigationGuardProvider>,
  );
}

async function editTheRow() {
  await userEvent.click(screen.getByText("V"));
  const name = screen.getByPlaceholderText("e.g. Vacation");
  await userEvent.clear(name);
  await userEvent.type(name, "Holiday");
}

beforeEach(() => {
  navigate.mockReset();
  vi.mocked(upsertAbsenceType).mockReset();
});

describe("a Settings row editor", () => {
  it("asks before a link drops the row's edits", async () => {
    renderRow();
    await editTheRow();

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Save your changes?")).toBeInTheDocument();
  });

  it("saves the row from the question, then leaves", async () => {
    vi.mocked(upsertAbsenceType).mockResolvedValue({ ...vacation, name: "Holiday" });
    renderRow();
    await editTheRow();

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(upsertAbsenceType).toHaveBeenCalledWith(expect.objectContaining({ name: "Holiday" }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("stays when the save fails", async () => {
    vi.mocked(upsertAbsenceType).mockRejectedValue(new Error("nope"));
    renderRow();
    await editTheRow();

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("e.g. Vacation")).toHaveValue("Holiday");
  });
});
