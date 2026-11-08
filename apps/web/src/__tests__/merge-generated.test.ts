// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACCURACY_MANIFEST,
  ManifestConflict,
  mergeManifestText,
} from "../../../../scripts/git/merge-generated.mjs";

const DRIVER = resolve(process.cwd(), "..", "..", "scripts/git/merge-generated.mjs");

function manifest(pages: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return `${JSON.stringify({ version: 1, ...extra, pages }, null, 2)}\n`;
}

function page(id: string, fingerprint: string, title = id) {
  return {
    id,
    title,
    sections: [{ id: "a", sourceFiles: ["x.ts"] }],
    evidenceFingerprint: fingerprint,
  };
}

describe("mergeManifestText", () => {
  it("keeps this side's hash and names the page when both sides re-record it", () => {
    const base = manifest([page("reports", "sha256:base"), page("alerts", "sha256:a0")]);
    const ours = manifest([page("reports", "sha256:ours"), page("alerts", "sha256:a0")]);
    const theirs = manifest([page("reports", "sha256:theirs"), page("alerts", "sha256:a1")]);

    const { text, pages } = mergeManifestText(base, ours, theirs);

    expect(pages).toEqual(["reports"]);
    expect(JSON.parse(text).pages).toEqual([
      page("reports", "sha256:ours"),
      page("alerts", "sha256:a1"),
    ]);
  });

  it("combines pages and fields each side changed on its own", () => {
    const base = manifest([page("reports", "h1")]);
    const ours = manifest([page("reports", "h1", "Reports")], { owner: "docs" });
    const theirs = manifest([page("reports", "h1"), page("billing", "h2")]);

    const { text, pages } = mergeManifestText(base, ours, theirs);

    expect(pages).toEqual([]);
    expect(JSON.parse(text)).toEqual({
      version: 1,
      owner: "docs",
      pages: [page("reports", "h1", "Reports"), page("billing", "h2")],
    });
  });

  it("drops a page one side removed and the other left alone", () => {
    const base = manifest([page("reports", "h1"), page("old", "h2")]);
    const ours = manifest([page("reports", "h1"), page("old", "h2")]);
    const theirs = manifest([page("reports", "h1")]);

    expect(JSON.parse(mergeManifestText(base, ours, theirs).text).pages).toEqual([
      page("reports", "h1"),
    ]);
  });

  it("refuses an overlapping change to anything but a fingerprint", () => {
    const base = manifest([page("reports", "h1")]);
    const ours = manifest([page("reports", "h1", "Reports")]);
    const theirs = manifest([page("reports", "h1", "Reporting")]);

    expect(() => mergeManifestText(base, ours, theirs)).toThrow(ManifestConflict);
  });

  it("refuses when one side removes a page the other changed", () => {
    const base = manifest([page("reports", "h1")]);
    const ours = manifest([page("reports", "h1", "Reports")]);
    const theirs = manifest([]);

    expect(() => mergeManifestText(base, ours, theirs)).toThrow(ManifestConflict);
  });
});

describe("the merge driver in a real merge", () => {
  let repo: string | undefined;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  function git(...args: string[]) {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  }

  function commitManifest(text: string, message: string) {
    writeFileSync(join(repo!, ACCURACY_MANIFEST), text);
    git("add", ACCURACY_MANIFEST);
    git("commit", "-q", "-m", message);
  }

  it("merges two re-recorded fingerprints without a conflict and leaves the page pending", () => {
    repo = mkdtempSync(join(tmpdir(), "merge-generated-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@dubgrid.test");
    git("config", "user.name", "Test");
    git("config", "core.hooksPath", "/dev/null");
    git("config", "merge.dubgrid-generated.driver", `node ${DRIVER} %O %A %B %P`);
    writeFileSync(join(repo, ".gitattributes"), `${ACCURACY_MANIFEST} merge=dubgrid-generated\n`);
    mkdirSync(join(repo, "internal/documentation"), { recursive: true });
    git("add", ".gitattributes");
    commitManifest(manifest([page("reports", "sha256:base")]), "base");
    git("checkout", "-q", "-b", "theirs");
    commitManifest(manifest([page("reports", "sha256:theirs")]), "theirs");
    git("checkout", "-q", "main");
    commitManifest(manifest([page("reports", "sha256:ours")]), "ours");

    git("merge", "-q", "--no-commit", "theirs");

    expect(JSON.parse(readFileSync(join(repo, ACCURACY_MANIFEST), "utf8")).pages).toEqual([
      page("reports", "sha256:ours"),
    ]);
    const pending = join(repo, ".git/dubgrid-generated-pending.json");
    expect(existsSync(pending)).toBe(true);
    expect(JSON.parse(readFileSync(pending, "utf8"))).toEqual({
      inventory: false,
      pages: ["reports"],
    });
  });
});
