import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PresenceAvatars from "@/components/PresenceAvatars";

describe("PresenceAvatars", () => {
  it("labels the current user's presence as Me without renaming other editors", () => {
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

    const selfAvatar = screen.getByRole("img", { name: "Me" });
    const otherAvatar = screen.getByRole("img", { name: '"Riley RN' });

    expect(otherAvatar).toHaveTextContent("RR");

    fireEvent.mouseEnter(selfAvatar);
    expect(screen.getByText("Me")).toBeInTheDocument();

    fireEvent.mouseLeave(selfAvatar);
    fireEvent.mouseEnter(otherAvatar);
    expect(screen.getByText('"Riley RN')).toBeInTheDocument();
  });
});
