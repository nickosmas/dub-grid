import { describe, expect, it } from "vitest";
import { isBootstrapConfigBundle } from "./bootstrap-config-bundle";

const list = { data: [], error: null };
const bundle = () => [
  { data: { id: "org-1" }, error: null },
  ...Array.from({ length: 9 }, () => list),
];

describe("isBootstrapConfigBundle", () => {
  it("accepts the bundle this code writes", () => {
    expect(isBootstrapConfigBundle(bundle())).toBe(true);
  });

  it("accepts a bundle carrying a query error, which the route then raises", () => {
    const withError = bundle();
    withError[3] = { data: null, error: { message: "timeout" } } as never;
    expect(isBootstrapConfigBundle(withError)).toBe(true);
  });

  it("rejects a bundle of another length, as another deployment would write", () => {
    expect(isBootstrapConfigBundle(bundle().slice(0, 9))).toBe(false);
    expect(isBootstrapConfigBundle([...bundle(), list])).toBe(false);
  });

  it("rejects a bundle whose positions hold the wrong kind of result", () => {
    const shifted = bundle();
    shifted[0] = list;
    expect(isBootstrapConfigBundle(shifted)).toBe(false);
    const notList = bundle();
    notList[5] = { data: { id: 1 }, error: null } as never;
    expect(isBootstrapConfigBundle(notList)).toBe(false);
  });

  it("rejects anything that isn't a bundle", () => {
    expect(isBootstrapConfigBundle(null)).toBe(false);
    expect(isBootstrapConfigBundle({})).toBe(false);
  });
});
