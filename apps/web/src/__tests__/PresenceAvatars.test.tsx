import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PresenceAvatars from "@/components/PresenceAvatars";

describe("PresenceAvatars", () => {
  it("counts and renders other people only", () => {
    render(
      <PresenceAvatars
        onlineUsers={[
          {
            editorSessionId: "session-self",
            userId: "user-1",
            userName: "Alex Admin",
            editingCell: null,
            canLockCells: true,
            isSameUser: true,
            sessionCount: 1,
          },
          {
            editorSessionId: "session-other",
            userId: "user-2",
            userName: '"Riley RN',
            editingCell: "emp-2_2026-04-12",
            canLockCells: true,
            isSameUser: false,
            sessionCount: 1,
          },
        ]}
      />,
    );

    const otherAvatar = screen.getByRole("img", { name: '"Riley RN' });

    expect(screen.getByRole("status")).toHaveTextContent("1 online");
    expect(screen.queryByRole("img", { name: "Me" })).not.toBeInTheDocument();
    expect(otherAvatar).toHaveTextContent("RR");

    fireEvent.mouseEnter(otherAvatar);
    expect(screen.getByText('"Riley RN')).toBeInTheDocument();
  });

  it("renders nothing when only the current account is supplied", () => {
    const { container } = render(
      <PresenceAvatars
        onlineUsers={[
          {
            editorSessionId: "session-self",
            userId: "user-1",
            userName: "Alex Admin",
            editingCell: null,
            canLockCells: true,
            isSameUser: true,
            sessionCount: 1,
          },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
