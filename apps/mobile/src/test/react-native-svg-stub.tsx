import { createElement, type ReactNode } from "react";

function stub(name: string) {
  return function SvgStub({ children }: { children?: ReactNode }) {
    return createElement("svg-" + name.toLowerCase(), null, children);
  };
}

export default stub("Svg");
export const Svg = stub("Svg");
export const G = stub("G");
export const Rect = stub("Rect");
export const Circle = stub("Circle");
export const Path = stub("Path");
export const Text = stub("Text");
