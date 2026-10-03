import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("is a plain button that reports clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create your link</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Create your link" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button")).toHaveProperty("type", "button");
  });

  it("swaps its label while in flight and stops taking clicks", async () => {
    const onClick = vi.fn();
    render(
      <Button busy="Making your link…" onClick={onClick}>
        Create your link
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Making your link…" });
    expect(button).toHaveProperty("disabled", true);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
