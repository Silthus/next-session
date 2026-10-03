import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, playerInitials } from "./Avatar";

describe("playerInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(playerInitials("Ana Lima")).toBe("AL");
    expect(playerInitials("  thu  nguyen tran ")).toBe("TN");
  });

  it("takes two letters of a single name", () => {
    expect(playerInitials("ana")).toBe("AN");
    expect(playerInitials("X")).toBe("X");
  });
});

describe("Avatar", () => {
  it("is decorative and keeps the same hue for the same name on every surface", () => {
    const first = render(<Avatar name="Ana Lima" />).container.firstElementChild;
    const second = render(<Avatar name="Ana Lima" size="xs" />).container.firstElementChild;
    expect(first?.getAttribute("aria-hidden")).toBe("true");
    expect(first?.textContent).toBe("AL");
    expect(hueOf(first)).toBe(hueOf(second));
  });
});

function hueOf(element: Element | null) {
  return [...(element?.classList ?? [])].find((name) => name.startsWith("bg-"));
}
