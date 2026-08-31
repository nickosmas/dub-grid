import { afterEach, describe, expect, it, vi } from "vitest";
import {
  saveOrganizationSettingsWithRecovery,
  type UpdateOrganizationSettingsInput,
} from "./access";
import type { Organization } from "@/types";

const baseline = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Acme Health",
  shiftDisplayMode: "code",
  updatedAt: "2026-08-29T10:00:00.000Z",
} as Organization;

const input: UpdateOrganizationSettingsInput = {
  orgId: baseline.id,
  expectedUpdatedAt: baseline.updatedAt!,
  shiftDisplayMode: "name",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("saveOrganizationSettingsWithRecovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries once when an unrelated organization field changed", async () => {
    const latest = { ...baseline, name: "Acme North", updatedAt: "2026-08-29T10:01:00.000Z" };
    const saved = { ...latest, shiftDisplayMode: "name", updatedAt: "2026-08-29T10:02:00.000Z" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ organization: latest }, 409))
      .mockResolvedValueOnce(jsonResponse({ organization: saved }, 200));
    vi.stubGlobal("fetch", fetch);

    await expect(saveOrganizationSettingsWithRecovery({ baseline, input })).resolves.toEqual({
      status: "saved",
      organization: saved,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toMatchObject({
      expectedUpdatedAt: latest.updatedAt,
      shiftDisplayMode: "name",
    });
  });

  it("keeps the server value when the edited field changed elsewhere", async () => {
    const latest = { ...baseline, shiftDisplayMode: "name", updatedAt: "2026-08-29T10:01:00.000Z" };
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ organization: latest }, 409));
    vi.stubGlobal("fetch", fetch);

    await expect(saveOrganizationSettingsWithRecovery({ baseline, input })).resolves.toEqual({
      status: "changed_elsewhere",
      organization: latest,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
