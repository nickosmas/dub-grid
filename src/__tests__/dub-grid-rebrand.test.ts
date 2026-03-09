import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { metadata } from "../app/layout";

const TAGLINE = "Smart staff scheduling for care facilities";

describe("layout metadata — DubGrid rebrand", () => {
  it("title (default or template) contains DubGrid", () => {
    const title = metadata.title as any;
    const titleStr = typeof title === 'object' ? (title.default || title.template || '') : String(title);
    expect(titleStr).toContain("DubGrid");
  });

  it("description is the DubGrid tagline", () => {
    expect(metadata.description).toBe(TAGLINE);
  });

  it("openGraph.title contains DubGrid", () => {
    expect(metadata.openGraph?.title).toContain("DubGrid");
  });

  it("openGraph.description is the DubGrid tagline", () => {
    expect(metadata.openGraph?.description).toBe(TAGLINE);
  });

  it("twitter.title contains DubGrid", () => {
    const twitter = metadata.twitter as { title?: string };
    expect(twitter?.title).toContain("DubGrid");
  });

  it("twitter.description is the DubGrid tagline", () => {
    const twitter = metadata.twitter as { description?: string };
    expect(twitter?.description).toBe(TAGLINE);
  });
});

describe("README — DubGrid rebrand", () => {
  const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf-8");

  it("contains DubGrid as the project title", () => {
    expect(readme).toContain("DubGrid");
  });

  it("contains npm run dev instruction", () => {
    expect(readme).toContain("npm run dev");
  });

  it("does not contain create-next-app boilerplate", () => {
    expect(readme).not.toContain("create-next-app");
  });

  it("does not contain bootstrapped with boilerplate", () => {
    expect(readme).not.toContain("bootstrapped with");
  });
});
