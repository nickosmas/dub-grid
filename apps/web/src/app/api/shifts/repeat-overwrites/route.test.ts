import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cells = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ user: { id: "user-1" } })),
  createRequestSupabaseClient: vi.fn(() => {
    const query = {
      select: () => query,
      eq: () => query,
      gte: () => query,
      lte: async () => ({ data: cells(), error: null }),
    };
    return { from: () => query };
  }),
}));

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

function countFor(dates: string[]) {
  return POST(
    new NextRequest("http://localhost/api/shifts/repeat-overwrites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ empId: "22222222-2222-4222-8222-222222222222", dates }),
    }),
  ).then((response) => response.json());
}

const snapshot = (snapshot_kind: string, state_kind: string) => ({ snapshot_kind, state_kind });

describe("POST /api/shifts/repeat-overwrites", () => {
  beforeEach(() => cells.mockReset());

  it("counts only the asked-for days an editor sees a shift or absence on", async () => {
    cells.mockReturnValue([
      { date: "2026-08-03", snapshots: [snapshot("draft", "worked")] },
      { date: "2026-08-04", snapshots: [snapshot("published", "absence")] },
      // Removed in the draft, so the day reads as empty.
      {
        date: "2026-08-05",
        snapshots: [snapshot("published", "worked"), snapshot("draft", "deleted")],
      },
      // Removed from the published schedule but given a shift again in the draft.
      {
        date: "2026-08-06",
        snapshots: [snapshot("published", "deleted"), snapshot("draft", "worked")],
      },
      { date: "2026-08-07", snapshots: [] },
      // Inside the range but not one of the series' days.
      { date: "2026-08-08", snapshots: [snapshot("draft", "worked")] },
    ]);

    await expect(
      countFor([
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-09",
      ]),
    ).resolves.toEqual({ overwriteCount: 3 });
  });
});
