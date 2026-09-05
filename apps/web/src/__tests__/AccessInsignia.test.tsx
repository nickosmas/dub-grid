import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessInsignia } from "@/components/staff/AccessInsignia";

describe("AccessInsignia", () => {
  it("crowns a super admin", () => {
    render(<AccessInsignia orgRole="super_admin" />);

    const insignia = screen.getByRole("img", { name: "Super Admin" });
    expect(insignia).toBeInTheDocument();
    expect(insignia).toHaveStyle({ background: "var(--dg-color-insignia-crown)" });
  });

  it("stars an admin", () => {
    render(<AccessInsignia orgRole="admin" />);

    const insignia = screen.getByRole("img", { name: "Admin" });
    expect(insignia).toBeInTheDocument();
    expect(insignia).toHaveStyle({ background: "var(--dg-color-brand)" });
  });

  it("leaves a plain user, a member with no account, and a platform role unmarked", () => {
    const { container, rerender } = render(<AccessInsignia orgRole="user" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AccessInsignia orgRole={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AccessInsignia orgRole="gridmaster" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("grows with the name it follows", () => {
    const { rerender } = render(<AccessInsignia orgRole="admin" />);
    expect(screen.getByRole("img", { name: "Admin" })).toHaveStyle({ width: "16px" });

    rerender(<AccessInsignia orgRole="admin" size="lg" />);
    expect(screen.getByRole("img", { name: "Admin" })).toHaveStyle({ width: "26px" });
  });
});
