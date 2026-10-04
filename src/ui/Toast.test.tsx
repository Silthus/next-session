import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("keeps a polite live region mounted before its message arrives", () => {
    const { rerender } = render(<Toast message={null} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");

    rerender(<Toast message={{ id: 1, text: "That night is locked now." }} />);

    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("That night is locked now.");
  });

  it("announces its message as a status with an optional action", async () => {
    const run = vi.fn();
    render(
      <Toast
        message={{ id: 1, text: "Session on Fri, Oct 16.", action: { label: "Undo", run } }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Session on Fri, Oct 16.");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(run).toHaveBeenCalledOnce();
  });

  it("empties the live region when the message goes away", () => {
    const { rerender } = render(<Toast message={{ id: 1, text: "Link rotated." }} />);
    const region = screen.getByRole("status");

    rerender(<Toast message={null} />);

    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("");
  });
});
