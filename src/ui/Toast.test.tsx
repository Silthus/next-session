import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("announces its message as a status with an optional action", async () => {
    const onAction = vi.fn();
    render(
      <Toast action="Undo" onAction={onAction}>
        Session on Fri, Oct 16.
      </Toast>,
    );
    expect(screen.getByRole("status").textContent).toContain("Session on Fri, Oct 16.");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("sits at the bottom unless asked to clear a bottom sheet", () => {
    const { rerender } = render(<Toast>Saved.</Toast>);
    expect(screen.getByRole("status").dataset.position).toBe("bottom");
    rerender(<Toast position="top">Saved.</Toast>);
    expect(screen.getByRole("status").dataset.position).toBe("top");
  });
});
