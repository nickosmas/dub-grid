import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const validateCsrfOrigin = vi.fn();
const updateSelfLinkedEmployeePhone = vi.fn();
const getEmployeeContactConflict = vi.fn();
const apiErrorResponse = vi.fn((_err: unknown, fallback: string, status: number) =>
  NextResponse.json({ error: fallback }, { status }),
);
const buildStaffValidationErrorResponse = vi.fn((_errors: unknown) =>
  NextResponse.json({ error: "Validation failed" }, { status: 400 }),
);

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/features/account/server", () => ({
  updateSelfLinkedEmployeePhone: (...args: unknown[]) => updateSelfLinkedEmployeePhone(...args),
}));
vi.mock("@/lib/employee-contact-conflicts", () => ({
  getEmployeeContactConflict: (...args: unknown[]) => getEmployeeContactConflict(...args),
}));
vi.mock("@/lib/error-handling", () => ({
  apiErrorResponse: (...args: unknown[]) =>
    apiErrorResponse(...(args as [unknown, string, number])),
}));
vi.mock("@/lib/staff-validation", () => ({
  buildStaffValidationErrorResponse: (errors: unknown) => buildStaffValidationErrorResponse(errors),
  getStaffFieldErrorsFromZod: (err: unknown) => err,
}));
vi.mock("@/lib/client-facing", () => ({
  extractRawErrorMessage: (err: unknown) => (err as Error)?.message ?? null,
}));

import { PATCH } from "./route";

const ORG_ID = "11111111-1111-1111-1111-111111111111";

function patch(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/profile/phone", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({
    user: { id: "user-1", email: "u@test.com" },
  });
  validateCsrfOrigin.mockReturnValue(null);
  getEmployeeContactConflict.mockReturnValue(null);
  updateSelfLinkedEmployeePhone.mockResolvedValue({ phone: "+15555550100" });
});

describe("PATCH /api/account/profile/phone", () => {
  it("updates phone successfully (phone is normalized by the contract schema)", async () => {
    const res = await PATCH(patch({ orgId: ORG_ID, phone: "+15555550100", expectedVersion: 3 }));
    expect(res.status).toBe(200);
    expect(updateSelfLinkedEmployeePhone).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        userEmail: "u@test.com",
        orgId: ORG_ID,
        expectedVersion: 3,
        // normalized US phone format
        phone: expect.stringMatching(/^\(\d{3}\) \d{3}-\d{4}$/),
      }),
    );
  });

  it("returns 409 on a contact conflict", async () => {
    getEmployeeContactConflict.mockReturnValueOnce({
      code: "EMPLOYEE_CONTACT_CONFLICT",
      field: "phone",
      error: "phone in use",
      message: "phone in use",
    });
    updateSelfLinkedEmployeePhone.mockRejectedValueOnce(new Error("duplicate"));
    const res = await PATCH(patch({ orgId: ORG_ID, phone: "+15555550100" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "EMPLOYEE_CONTACT_CONFLICT",
      field: "phone",
    });
  });

  it("returns 409 on a version conflict", async () => {
    updateSelfLinkedEmployeePhone.mockRejectedValueOnce(new Error("contact changed elsewhere"));
    const res = await PATCH(patch({ orgId: ORG_ID, phone: "+15555550100", expectedVersion: 1 }));
    expect(res.status).toBe(409);
  });

  it("rejects an invalid orgId with 400", async () => {
    const res = await PATCH(patch({ orgId: "not-a-uuid", phone: "+15555550100" }));
    expect(res.status).toBe(400);
    expect(updateSelfLinkedEmployeePhone).not.toHaveBeenCalled();
  });

  it("blocks invalid CSRF", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await PATCH(patch({ orgId: ORG_ID, phone: null }));
    expect(res.status).toBe(403);
    expect(updateSelfLinkedEmployeePhone).not.toHaveBeenCalled();
  });
});
