import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSheet } from "./AccountSheet";

function renderInRouter(node: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

const email = "gm@example.test";
const password = "correct horse";

async function fillIn() {
  await userEvent.type(await screen.findByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe("AccountSheet saving a Group", () => {
  it("creates an Account by default and closes once the Group is saved", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    renderInRouter(
      <AccountSheet
        open
        intent="save"
        groupName="My group"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Keep My group" })).toBeTruthy();
    expect(screen.getByText(/The player link stays exactly the same/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveProperty("pathname", "/terms");

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(onSubmit).toHaveBeenCalledWith({ email, password, mode: "create" });
    expect(onClose).toHaveBeenCalled();
  });

  it("logs in to an existing Account when the GM already has one", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    renderInRouter(
      <AccountSheet
        open
        intent="save"
        groupName="My group"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );

    await userEvent.click(await screen.findByRole("radio", { name: "I already have one" }));
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in and save" }));

    expect(onSubmit).toHaveBeenCalledWith({ email, password, mode: "logIn" });
    expect(screen.queryByRole("link", { name: "Terms" })).toBeNull();
  });

  it("offers to log in instead when the email already has an Account", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ConvexError({ code: "EMAIL_TAKEN" }))
      .mockResolvedValueOnce(undefined);
    renderInRouter(
      <AccountSheet
        open
        intent="save"
        groupName="My group"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));
    expect(await screen.findByText("That email already has an account.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Log in instead" }));
    await userEvent.click(screen.getByRole("button", { name: "Log in and save" }));

    expect(onSubmit).toHaveBeenLastCalledWith({ email, password, mode: "logIn" });
  });

  it("keeps the fields and disables the button while saving", async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderInRouter(
      <AccountSheet
        open
        intent="save"
        groupName="My group"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
    finish();
  });
});

describe("AccountSheet logging in", () => {
  it("asks only for the email and the password", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    renderInRouter(<AccountSheet open intent="logIn" onSubmit={onSubmit} onClose={onClose} />);

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(onSubmit).toHaveBeenCalledWith({ email, password, mode: "logIn" });
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    [new ConvexError({ code: "INVALID_CREDENTIALS" }), "Wrong email or password."],
    [
      new ConvexError({ code: "RATE_LIMITED", retryAfter: 360_000 }),
      "Too many tries. Try again in 6 minutes.",
    ],
    [
      new ConvexError({ code: "RATE_LIMITED", retryAfter: 20_000 }),
      "Too many tries. Try again in a minute.",
    ],
    [new Error("Server Error"), "That didn't work. Try again."],
  ])("explains a failed log in and lets the GM retry", async (error, message) => {
    const onSubmit = vi.fn().mockRejectedValueOnce(error);
    const onClose = vi.fn();
    renderInRouter(<AccountSheet open intent="logIn" onSubmit={onSubmit} onClose={onClose} />);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByRole("button", { name: "Log in" })).toHaveProperty("disabled", false);
    expect(screen.getByLabelText("Email")).toHaveProperty("value", email);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains a password that is too short when creating an Account", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new ConvexError({ code: "WEAK_PASSWORD" }));
    renderInRouter(
      <AccountSheet
        open
        intent="save"
        groupName="My group"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Use at least 8 characters for the password.",
    );
  });
});
