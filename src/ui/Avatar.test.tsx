import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("is decorative and keeps the same hue for the same name on every surface", () => {
    const first = render(<Avatar name="Ana Lima" />).container.firstElementChild;
    const second = render(<Avatar name="Ana Lima" size="xs" />).container.firstElementChild;
    expect(first?.getAttribute("aria-hidden")).toBe("true");
    expect(first?.textContent).toBe("AL");
    expect(hueOf(first)).toBe(hueOf(second));
  });
});

describe("Avatar with a profile picture", () => {
  const picture = "https://files.example.test/ada.png";

  it("shows the picture instead of the letters, without sending a referrer", () => {
    const avatar = render(<Avatar name="Ada" image={picture} />).container.firstElementChild;
    const shown = avatar?.querySelector("img");
    expect(shown?.getAttribute("src")).toBe(picture);
    expect(shown?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(avatar?.textContent).toBe("");
  });

  it("falls back to the letters when the picture does not load", () => {
    const avatar = render(<Avatar name="Ada" image={picture} />).container.firstElementChild;
    fireEvent.error(avatar!.querySelector("img")!);
    expect(avatar?.querySelector("img")).toBeNull();
    expect(avatar?.textContent).toBe("AD");
  });
});

describe("Avatar hues", () => {
  it("never borrow the answer colors", () => {
    const names = ["Ana", "Ben", "Cleo", "Dan", "Eve", "Finn", "Gus", "Hal"];
    const hues = names.map((name) => render(<Avatar name={name} />).container.firstElementChild);
    for (const hue of hues) {
      expect([...(hue?.classList ?? [])].join(" ")).not.toMatch(/free|maybe|busy/);
    }
  });
});

function hueOf(element: Element | null) {
  return [...(element?.classList ?? [])].find((name) => name.startsWith("bg-"));
}
