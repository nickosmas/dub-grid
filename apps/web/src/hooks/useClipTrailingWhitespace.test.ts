import { describe, expect, it } from "vitest";
import {
  measureContentBottom,
  paintsBox,
  revealsOnlyWhitespace,
} from "./useClipTrailingWhitespace";

const PAGE_BG = "rgb(250, 250, 250)";
const PAGE = new Set([PAGE_BG]);

function box(style: Partial<CSSStyleDeclaration> = {}) {
  return {
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    boxShadow: "none",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
    ...style,
  } as CSSStyleDeclaration;
}

function el(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

function placeAt(element: Element, top: number, bottom: number) {
  element.getBoundingClientRect = () =>
    ({ top, bottom, height: bottom - top, width: 100, left: 0, right: 100 }) as DOMRect;
}

describe("paintsBox", () => {
  it("treats an unpainted wrapper as whitespace", () => {
    expect(paintsBox(box(), PAGE)).toBe(false);
  });

  it("treats a wrapper filled with the page background as whitespace", () => {
    expect(paintsBox(box({ backgroundColor: PAGE_BG }), PAGE)).toBe(false);
  });

  it("counts cards drawn with a fill, border or shadow", () => {
    expect(paintsBox(box({ backgroundColor: "rgb(255, 255, 255)" }), PAGE)).toBe(true);
    expect(paintsBox(box({ borderBottomWidth: "1px" }), PAGE)).toBe(true);
    expect(paintsBox(box({ boxShadow: "0 1px 2px rgba(0,0,0,.1)" }), PAGE)).toBe(true);
  });
});

describe("measureContentBottom", () => {
  it("stops at the last card, not at the padding of the wrappers around it", () => {
    const root = el(`
      <main id="wrapper" style="padding-bottom: 32px">
        <section id="card" style="border: 1px solid red"><p id="text">Coverage</p></section>
      </main>`);
    placeAt(root.querySelector("#wrapper")!, 0, 1210);
    placeAt(root.querySelector("#card")!, 900, 1179);
    placeAt(root.querySelector("#text")!, 920, 940);
    expect(measureContentBottom(root, PAGE)).toBe(1179);
  });

  it("counts text in an unpainted element", () => {
    const root = el(`<div id="wrap"><span id="label">Today</span></div>`);
    placeAt(root.querySelector("#wrap")!, 0, 400);
    placeAt(root.querySelector("#label")!, 100, 120);
    expect(measureContentBottom(root, PAGE)).toBe(120);
  });

  it("ignores hidden and fixed elements", () => {
    const root = el(`
      <p id="text">Shown</p>
      <p id="hidden" style="display: none">Hidden</p>
      <p id="fixed" style="position: fixed">Toast</p>`);
    placeAt(root.querySelector("#text")!, 0, 50);
    placeAt(root.querySelector("#hidden")!, 0, 900);
    placeAt(root.querySelector("#fixed")!, 0, 900);
    expect(measureContentBottom(root, PAGE)).toBe(50);
  });

  it("does not count content a clipping box hides", () => {
    const root = el(`
      <div id="clip" style="overflow: hidden"><p id="long">Rows</p></div>`);
    placeAt(root.querySelector("#clip")!, 0, 300);
    placeAt(root.querySelector("#long")!, 0, 2000);
    expect(measureContentBottom(root, PAGE)).toBe(300);
  });
});

describe("revealsOnlyWhitespace", () => {
  const contentAt = (bottom: number) => () => bottom;

  it("clips a scroll that would show only padding", () => {
    expect(
      revealsOnlyWhitespace({
        scrollHeight: 1210,
        clientHeight: 1202,
        contentBottom: contentAt(1179),
      }),
    ).toBe(true);
  });

  it("keeps scrolling when content runs past the fold", () => {
    expect(
      revealsOnlyWhitespace({
        scrollHeight: 1251,
        clientHeight: 1202,
        contentBottom: contentAt(1218),
      }),
    ).toBe(false);
  });

  it("does nothing when the page does not overflow", () => {
    expect(
      revealsOnlyWhitespace({
        scrollHeight: 900,
        clientHeight: 900,
        contentBottom: contentAt(500),
      }),
    ).toBe(false);
  });

  it("treats a large overflow as real content without scanning", () => {
    let scanned = false;
    const contentBottom = () => {
      scanned = true;
      return 0;
    };
    expect(revealsOnlyWhitespace({ scrollHeight: 3000, clientHeight: 900, contentBottom })).toBe(
      false,
    );
    expect(scanned).toBe(false);
  });
});
