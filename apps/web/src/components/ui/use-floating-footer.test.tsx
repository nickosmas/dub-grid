import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFloatingFooter } from "@/components/ui/use-floating-footer";

function Footer({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFloatingFooter(ref, enabled);
  return <div ref={ref} data-testid="footer" />;
}

const offset = () =>
  screen.getByTestId("footer").style.getPropertyValue("--dg-floating-footer-bottom");

describe("useFloatingFooter", () => {
  it("reaches back into the scroll area's end padding to sit 8px above the screen's edge", () => {
    render(
      <div style={{ overflowY: "auto", paddingBottom: "32px" }}>
        <section>
          <Footer />
        </section>
      </div>,
    );

    expect(offset()).toBe("-24px");
  });

  it("sits 8px up when the page itself scrolls", () => {
    render(
      <section>
        <Footer />
      </section>,
    );

    expect(offset()).toBe("8px");
  });

  it("sets no offset while the footer can't float", () => {
    render(
      <div style={{ overflowY: "auto", paddingBottom: "32px" }}>
        <section>
          <Footer enabled={false} />
        </section>
      </div>,
    );

    expect(offset()).toBe("");
  });
});
