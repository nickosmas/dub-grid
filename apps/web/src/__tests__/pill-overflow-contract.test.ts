import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css =
  readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8") +
  readFileSync(path.resolve(__dirname, "../app/app-ui.css"), "utf8");

describe("pill overflow contract", () => {
  it("bounds display pills while allowing their full text to wrap", () => {
    expect(css).toMatch(
      /\.dg-pill-display\s*\{[^}]*max-inline-size:\s*100%[^}]*min-inline-size:\s*0[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/,
    );
  });

  it("keeps interactive pill labels on one truncated line", () => {
    expect(css).toMatch(
      /\.dg-pill-action\s*\{[^}]*max-inline-size:\s*100%[^}]*min-inline-size:\s*0[^}]*overflow:\s*hidden[^}]*white-space:\s*nowrap/,
    );
    expect(css).toMatch(
      /\.dg-pill-action-label\s*\{[^}]*min-inline-size:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
    );
  });
});
