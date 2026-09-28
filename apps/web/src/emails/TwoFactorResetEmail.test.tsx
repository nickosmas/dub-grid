import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { TwoFactorResetEmail } from "./TwoFactorResetEmail";

async function text(partial?: boolean) {
  return render(
    <TwoFactorResetEmail logoUrl="https://www.dubgrid.com/logo.png" partial={partial} />,
    {
      plainText: true,
    },
  );
}

describe("TwoFactorResetEmail", () => {
  it("says the person was signed out everywhere after a full reset", async () => {
    expect(await text()).toContain("signed you out everywhere");
  });

  it("never claims everywhere when the reset stopped part way (F-102)", async () => {
    const body = await text(true);
    expect(body).not.toContain("everywhere");
    expect(body).toContain("sign out of any you don't recognize");
  });
});
