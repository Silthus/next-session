import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeaderAccount } from "./HeaderAccount";

describe("HeaderAccount", () => {
  it("offers an Anonymous GM to save the group", async () => {
    const onSave = vi.fn();
    render(<HeaderAccount status="anonymous" onSave={onSave} onLogOut={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save your group" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("shows an Account who is signed in and lets them log out", async () => {
    const onLogOut = vi.fn();
    render(
      <HeaderAccount
        status="account"
        email="gm@example.com"
        onSave={vi.fn()}
        onLogOut={onLogOut}
      />,
    );
    expect(screen.queryByRole("button", { name: "Save your group" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Your account" }));
    expect(screen.getByText("gm@example.com")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogOut).toHaveBeenCalledOnce();
  });
});
