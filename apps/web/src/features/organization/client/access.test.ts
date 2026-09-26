import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvitationAccessConflictError,
  replaceOrganizationInvitationAccessGuarded,
  saveOrganizationSettingsWithRecovery,
  updateOrganizationInvitationGuarded,
  type UpdateOrganizationSettingsInput,
} from "./access";
import { getStepUpMethod } from "@/features/account/client/step-up";
import type { Invitation, Organization } from "@/types";

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

describe("guarded invitation writes and step-up", () => {
  afterEach(() => vi.unstubAllGlobals());

  const invitationInput = {
    orgId: "org-1",
    invitationId: "inv-1",
    expectedUpdatedAt: "2026-09-26T10:00:00.000Z",
  };
  const stepUpBody = {
    error: "Confirm your identity to continue.",
    code: "STEP_UP_REQUIRED",
    method: "totp",
  };
  const writes = [
    {
      name: "replaceOrganizationInvitationAccessGuarded",
      send: (accessToken?: string) =>
        replaceOrganizationInvitationAccessGuarded(
          { ...invitationInput, roleToAssign: "super_admin" },
          accessToken,
        ),
    },
    {
      name: "updateOrganizationInvitationGuarded",
      send: (accessToken?: string) =>
        updateOrganizationInvitationGuarded(
          { ...invitationInput, roleToAssign: "super_admin" },
          accessToken,
        ),
    },
  ];

  it.each(writes)("$name sends the step-up token as a bearer header", async ({ send }) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ invitation: { id: "inv-1" } }, 200));
    vi.stubGlobal("fetch", fetch);

    await send("fresh-token");

    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: "Bearer fresh-token",
    });
  });

  it.each(writes)("$name sends no bearer header without a token", async ({ send }) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ invitation: { id: "inv-1" } }, 200));
    vi.stubGlobal("fetch", fetch);

    await send();

    expect(fetch.mock.calls[0]![1]!.headers).not.toHaveProperty("Authorization");
  });

  it.each(writes)("$name throws an error step-up recognizes", async ({ send }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(stepUpBody, 403)));

    const error = await send().catch((failure: unknown) => failure);

    expect(error).toMatchObject({ status: 403, code: "STEP_UP_REQUIRED", method: "totp" });
    expect(getStepUpMethod(error)).toBe("totp");
  });

  it.each(writes)("$name still reports a conflict with the latest invitation", async ({ send }) => {
    const latest = { id: "inv-1", updatedAt: "2026-09-26T10:01:00.000Z" } as Invitation;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ invitation: latest }, 409)));

    const error = await send().catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(InvitationAccessConflictError);
    expect((error as InvitationAccessConflictError).latestInvitation).toEqual(latest);
  });
});
