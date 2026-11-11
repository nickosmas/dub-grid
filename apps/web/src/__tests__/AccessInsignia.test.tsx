import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessInsignia } from "@/components/staff/AccessInsignia";

describe("AccessInsignia", () => {
  it("gives a super admin a gold star", () => {
    render(<AccessInsignia orgRole="super_admin" />);

    const insignia = screen.getByRole("img", { name: "Super Admin" });
    expect(insignia).toBeInTheDocument();
    expect(insignia).toHaveStyle({ background: "var(--dg-color-insignia-gold)" });
  });

  it("gives an admin a blue star", () => {
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
    expect(screen.getByRole("img", { name: "Admin" })).toHaveStyle({ width: "14px" });

    rerender(<AccessInsignia orgRole="admin" size="lg" />);
    expect(screen.getByRole("img", { name: "Admin" })).toHaveStyle({ width: "20px" });
  });

  it("lights the top edge and shades the bottom with a 1px bevel", () => {
    render(<AccessInsignia orgRole="super_admin" />);

    expect(screen.getByRole("img", { name: "Super Admin" }).style.boxShadow).toBe(
      "inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.16)",
    );
  });

  it("sizes the star to the face inside the bevel at every size", () => {
    const { rerender } = render(<AccessInsignia orgRole="admin" />);
    const star = () => screen.getByRole("img", { name: "Admin" }).querySelector("svg");
    expect(star()).toHaveAttribute("width", "12");

    rerender(<AccessInsignia orgRole="admin" size="md" />);
    expect(star()).toHaveAttribute("width", "14");

    rerender(<AccessInsignia orgRole="admin" size="lg" />);
    expect(star()).toHaveAttribute("width", "18");
  });
});
