import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PermissionsEditor from "@/components/PermissionsEditor";
import { ALL_FALSE_PERMS } from "./factories";

type EditorProps = React.ComponentProps<typeof PermissionsEditor>;

function renderEditor(props: Partial<EditorProps> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <PermissionsEditor
      title="Permissions"
      subtitle="Test subtitle"
      initialPermissions={null}
      onSave={onSave}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return { onSave };
}

describe("PermissionsEditor", () => {
  it("enables Save only after a real permission change and disables it when reverted", async () => {
    const user = userEvent.setup();
    renderEditor({ initialPermissions: ALL_FALSE_PERMS });

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /select all/i }));
    expect(saveButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /clear all/i }));
    expect(saveButton).toBeDisabled();
  });

  it("reports Dashboard as included instead of a live switch while an implying level is on", async () => {
    const user = userEvent.setup();
    renderEditor();

    // The admin baseline turns on two of the levels that grant Dashboard.
    expect(screen.queryByRole("switch", { name: "Dashboard view" })).not.toBeInTheDocument();
    expect(screen.getByText("Included with Schedule, Publish schedule.")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Schedule edit" }));
    expect(screen.getByText("Included with Publish schedule.")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Publish schedule edit" }));
    expect(screen.getByRole("switch", { name: "Dashboard view" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("never renders or saves the organization settings key, whatever was stored", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({
      initialPermissions: { ...ALL_FALSE_PERMS, canManageOrgSettings: true },
    });

    expect(screen.queryByText(/organization settings/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Reports view" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ canManageOrgSettings: false, canViewReports: true }),
    );
  });

  it("counts the access levels on screen rather than the stored keys", async () => {
    const user = userEvent.setup();
    renderEditor({ showPermissionCounter: true });

    // A stored set that never mentions a key starts from the admin baseline:
    // Schedule edit, Publish, Recurring (view included), Reports, plus the
    // Requests view and Dashboard those bring with them.
    expect(screen.getByText("7 of 16 access levels enabled")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Reports view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // One switch, two stored keys behind it.
    await user.click(screen.getByRole("switch", { name: "Departments & labels view" }));
    expect(screen.getByText("8 of 16 access levels enabled")).toBeInTheDocument();
  });

  it("brings View along with Edit and reports it as included while Edit stays on", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    // Recurring already reads "Included with Edit." from the admin baseline.
    expect(screen.getAllByText("Included with Edit.")).toHaveLength(1);
    await user.click(screen.getByRole("switch", { name: "Staff edit" }));
    expect(screen.queryByRole("switch", { name: "Staff view" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Included with Edit.")).toHaveLength(2);

    // Turning Edit back off hands the View switch back, still on.
    await user.click(screen.getByRole("switch", { name: "Coverage edit" }));
    expect(screen.queryByRole("switch", { name: "Coverage view" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Coverage edit" }));
    expect(screen.getByRole("switch", { name: "Coverage view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        canManageEmployees: true,
        canViewEmployeeDetails: true,
        canViewCoverageRequirements: true,
        canManageCoverageRequirements: false,
      }),
    );
  });

  it("explains the implicit requests view and reads org terminology in descriptions", () => {
    renderEditor({ labels: { certificationLabel: "Skill Levels", focusAreaLabel: "Wings" } });

    expect(
      screen.getByText(
        /Seeing everyone's requests comes with Approve, Staff: Edit, or Schedule: Edit/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/contact details, and skill levels/)).toBeInTheDocument();
    expect(screen.getByText(/departments and wings/)).toBeInTheDocument();
  });

  it("runs the review step before saving when one is supplied", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({
      buildReview: () => ({
        title: "Review permission changes",
        description: "Check these first.",
        changes: [
          {
            key: "adminPermissions",
            label: "Admin Permissions",
            previousDisplay: "No extra permissions",
            nextDisplay: "View coverage requirements",
            sensitive: true,
          },
        ],
      }),
    });

    await user.click(screen.getByRole("switch", { name: "Coverage view" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Check these first.")).toBeInTheDocument();
  });

  it("hides the review while a step-up dialog takes over the save (41d4)", async () => {
    const user = userEvent.setup();
    renderEditor({
      obscured: true,
      buildReview: () => ({
        title: "Review permission changes",
        description: "Check these first.",
        changes: [
          {
            key: "adminPermissions",
            label: "Admin Permissions",
            previousDisplay: "No extra permissions",
            nextDisplay: "View coverage requirements",
            sensitive: true,
          },
        ],
      }),
    });

    await user.click(screen.getByRole("switch", { name: "Coverage view" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(screen.queryByText("Check these first.")).not.toBeInTheDocument();
  });

  it("stays open with the review up when the save does not complete (F-69)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(false);
    renderEditor({
      onSave,
      onClose,
      buildReview: () => ({
        title: "Review permission changes",
        description: "Check these first.",
        changes: [
          {
            key: "adminPermissions",
            label: "Admin Permissions",
            previousDisplay: "No extra permissions",
            nextDisplay: "View coverage requirements",
            sensitive: true,
          },
        ],
      }),
    });

    await user.click(screen.getByRole("switch", { name: "Coverage view" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await user.click(screen.getByRole("button", { name: /confirm save/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Check these first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm save/i })).toBeEnabled();
    // The review is modal, so the editor beneath it is out of the accessibility tree.
    expect(screen.getByRole("switch", { name: "Coverage view", hidden: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
