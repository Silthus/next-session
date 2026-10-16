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
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("stays out of clicks while in flight even when its caller also disables it", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled busy="Logging in…" onClick={onClick}>
        Log in
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Logging in…" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its form from submitting again while in flight", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <input aria-label="Where" />
        <Button type="submit" busy="Saving…">
          Save
        </Button>
      </form>,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Where" }), "Max's place{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Saving…" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
