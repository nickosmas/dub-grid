// @vitest-environment node
import * as React from "react";
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { EmailLayout } from "./EmailLayout";
import { emailClass, emailDarkCss } from "./theme";

const html = () =>
  render(createElement(EmailLayout, { logoUrl: "https://app.test", children: <p>Body</p> }));

describe("EmailLayout", () => {
  // The first image is all a client that ignores the dark styles ever shows,
  // so it must be the one with its own background, and the other must stay hidden.
  it("shows the plated logo by default and keeps the dark one hidden", async () => {
    const page = await html();

    expect(page.indexOf("email-logo-light.png")).toBeLessThan(page.indexOf("email-logo-dark.png"));
    expect(page).toMatch(/class="dg-logo-dark"[^>]*style="[^"]*display:none/);
    expect(page).toContain('name="color-scheme" content="light dark"');
  });

  // Many clients drop the body's background, so the page color needs its own element.
  it("sets the email on a full-width gray page, and black in dark mode", async () => {
    const page = await html();

    expect(page).toMatch(/<table[^>]*bgcolor="#E5E5E5"[^>]*width:100%/);
    expect(page.lastIndexOf("email-logo-light.png")).toBeGreaterThan(
      page.indexOf('class="dg-sheet"'),
    );
    expect(emailDarkCss).toContain(`.${emailClass.page}{background-color:#000000!important}`);
    expect(emailDarkCss).toContain(`.${emailClass.sheet}{background-color:#18181B!important}`);
  });

  it("swaps the logo for every kind of dark mode", () => {
    for (const hook of ["@media (prefers-color-scheme:dark){", "[data-ogsc] "]) {
      const rules = emailDarkCss.slice(emailDarkCss.indexOf(hook));
      expect(rules).toContain(`.${emailClass.logoLight}{display:none!important}`);
      expect(rules).toContain(`.${emailClass.logoDark}{display:block!important`);
    }
    expect(emailDarkCss).toContain(`[data-ogsb] .${emailClass.page}{background-color:`);
  });

  // Rendered as a text node, React would escape the CSS.
  it("keeps the dark styles intact in the page", async () => {
    expect(await html()).toContain(emailDarkCss);
  });
});
