import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { HeaderAccount } from "./HeaderAccount";

function renderInRouter(component: () => ReactNode) {
  const rootRoute = createRootRoute({ component });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("HeaderAccount", () => {
  it("offers an Anonymous GM to save the group", async () => {
    const onSave = vi.fn();
    renderInRouter(() => <HeaderAccount status="anonymous" onSave={onSave} />);
    await userEvent.click(await screen.findByRole("button", { name: "Save your group" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "My groups" })).toBeNull();
  });

  it("shows an Account who is signed in and lets them log out", async () => {
    const onLogOut = vi.fn();
    renderInRouter(() => (
      <HeaderAccount status="account" email="gm@example.com" onLogOut={onLogOut} />
    ));
    await userEvent.click(await screen.findByRole("button", { name: "Your account" }));
    expect(screen.queryByRole("button", { name: "Save your group" })).toBeNull();
    expect(screen.getByText("gm@example.com")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogOut).toHaveBeenCalledOnce();
  });

  it("takes an Account to My groups", async () => {
    renderInRouter(() => (
      <HeaderAccount status="account" email="gm@example.com" onLogOut={vi.fn()} />
    ));
    await userEvent.click(await screen.findByRole("button", { name: "Your account" }));
    expect(screen.getByRole("link", { name: "My groups" })).toHaveProperty("pathname", "/me");
  });
});
