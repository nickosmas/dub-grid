import { describe, expect, it, vi } from "vitest";
import { getLoginEmailChange, LoginEmailConflictError, syncLinkedLoginEmail } from "./login-email";

describe("getLoginEmailChange", () => {
  it("ignores records without an account", () => {
    expect(
      getLoginEmailChange({ userId: null, previousEmail: "a@x.test", nextEmail: "b@x.test" }),
    ).toBeNull();
  });

  it("ignores a same address in different case or spacing", () => {
    expect(
      getLoginEmailChange({ userId: "u", previousEmail: "A@x.test", nextEmail: " a@x.test " }),
    ).toBeNull();
  });

  it("ignores a blank address; the route rejects it separately", () => {
    expect(
      getLoginEmailChange({ userId: "u", previousEmail: "a@x.test", nextEmail: "" }),
    ).toBeNull();
  });

  it("returns the trimmed new address for a linked record", () => {
    expect(
      getLoginEmailChange({ userId: "u", previousEmail: "a@x.test", nextEmail: " b@x.test " }),
    ).toBe("b@x.test");
  });
});

describe("syncLinkedLoginEmail", () => {
  function client(result: { error: unknown }) {
    const updateUserById = vi.fn(async () => result);
    return { client: { auth: { admin: { updateUserById } } } as never, updateUserById };
  }

  it("confirms the new address so the account signs in with it at once", async () => {
    const { client: c, updateUserById } = client({ error: null });
    await syncLinkedLoginEmail(c, { userId: "u", email: " b@x.test " });
    expect(updateUserById).toHaveBeenCalledWith("u", { email: "b@x.test", email_confirm: true });
  });

  it("maps a taken address to the contact conflict the editor already shows", async () => {
    const { client: c } = client({
      error: { status: 422, code: "email_exists", message: "Email address already registered" },
    });
    await expect(
      syncLinkedLoginEmail(c, { userId: "u", email: "b@x.test" }),
    ).rejects.toBeInstanceOf(LoginEmailConflictError);
  });

  it("rethrows other failures", async () => {
    const { client: c } = client({ error: { status: 500, message: "boom" } });
    await expect(syncLinkedLoginEmail(c, { userId: "u", email: "b@x.test" })).rejects.toMatchObject(
      {
        message: "boom",
      },
    );
  });
});
