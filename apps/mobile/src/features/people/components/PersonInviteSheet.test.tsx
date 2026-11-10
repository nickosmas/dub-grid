import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ORG_ROLE_LABELS } from "@dubgrid/domain";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let PersonInviteSheet: (typeof import("./PersonInviteSheet"))["PersonInviteSheet"];

beforeAll(async () => {
  PersonInviteSheet = (await import("./PersonInviteSheet")).PersonInviteSheet;
});

function renderSheet() {
  const onDismiss = vi.fn();
  render(
    <PersonInviteSheet
      canGrantSuperAdmin={false}
      email="mina@dubgrid.com"
      isPending={false}
      onDismiss={onDismiss}
      onSend={vi.fn()}
      permissionLabels={{
        focusAreaLabel: "Focus Areas",
        certificationLabel: "Certifications",
        roleLabel: "Roles",
      }}
      personName="Mina Diaz"
      visible
    />,
  );
  return { onDismiss };
}

describe("PersonInviteSheet", () => {
  it("closes without asking while it still holds the default role", () => {
    const { onDismiss } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("asks before a chosen role is dropped, with no Save, since sending is a decision", () => {
    const { onDismiss } = renderSheet();

    fireEvent.click(screen.getByText(ORG_ROLE_LABELS.admin));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
    const alert = within(screen.getByRole("alert"));
    expect(alert.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.click(alert.getByRole("button", { name: "Keep editing" }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
