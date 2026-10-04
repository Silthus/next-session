import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveInput } from "./save";
import { AccountSheet } from "./AccountSheet";

type Submit = (input: SaveInput) => Promise<unknown>;

function renderSheet(props: ComponentProps<typeof AccountSheet>) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AccountSheet {...props} /> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

function renderSaveSheet(onSubmit: Submit, onClose = vi.fn()) {
  renderSheet({ open: true, intent: "save", groupName: "My group", onSubmit, onClose });
  return onClose;
}

function renderLogInSheet(onSubmit: Submit, onClose = vi.fn()) {
  renderSheet({ open: true, intent: "logIn", onSubmit, onClose });
  return onClose;
}

const email = "gm@example.test";
const password = "correct horse";

async function fillIn(withPassword = password) {
  await userEvent.type(await screen.findByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), withPassword);
}

async function alertText() {
  return (await screen.findByRole("alert")).textContent;
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
    const onClose = renderSaveSheet(onSubmit);

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
    renderSaveSheet(onSubmit);

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
    renderSaveSheet(onSubmit);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));
    expect(await alertText()).toBe("That email already has an account.");

    await userEvent.click(screen.getByRole("button", { name: "Log in instead" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Password"));
    await userEvent.click(screen.getByRole("button", { name: "Log in and save" }));

    expect(onSubmit).toHaveBeenLastCalledWith({ email, password, mode: "logIn" });
  });

  it("offers to create an Account when logging in to save fails", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ConvexError({ code: "INVALID_CREDENTIALS" }))
      .mockResolvedValueOnce(undefined);
    renderSaveSheet(onSubmit);

    await userEvent.click(await screen.findByRole("radio", { name: "I already have one" }));
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in and save" }));
    expect(await alertText()).toBe("Wrong email or password.");

    await userEvent.click(screen.getByRole("button", { name: "Create account instead" }));
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(onSubmit).toHaveBeenLastCalledWith({ email, password, mode: "create" });
  });

  it("keeps the fields, and stays open, while saving", async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const onClose = renderSaveSheet(onSubmit);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Email")).toHaveProperty("value", email);
    expect(screen.getByLabelText("Password")).toHaveProperty("value", password);
    finish();
  });

  it("refuses a password under 8 characters before asking the server", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    renderSaveSheet(onSubmit);

    const passwordField = await screen.findByLabelText("Password");
    const hint = document.getElementById(passwordField.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("At least 8 characters.");

    await fillIn("short");
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(await alertText()).toBe("Use at least 8 characters for the password.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("explains a password the server finds too short", async () => {
    renderSaveSheet(vi.fn().mockRejectedValueOnce(new ConvexError({ code: "WEAK_PASSWORD" })));

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(await alertText()).toBe("Use at least 8 characters for the password.");
  });
});

describe("AccountSheet logging in", () => {
  it("asks only for the email and the password", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = renderLogInSheet(onSubmit);

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(onSubmit).toHaveBeenCalledWith({ email, password, mode: "logIn" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sends a GM without an Account back to create their link", async () => {
    const onClose = renderLogInSheet(vi.fn());
    await userEvent.click(await screen.findByRole("button", { name: "Go back" }));
    expect(screen.getByText(/No account yet\?/).textContent).toBe(
      "No account yet? Go back and create your link.",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("cannot be sent back while logging in", async () => {
    const onClose = renderLogInSheet(vi.fn(() => new Promise(() => {})));

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("button", { name: "Go back" })).toHaveProperty("disabled", true);
    expect(onClose).not.toHaveBeenCalled();
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
    const onClose = renderLogInSheet(vi.fn().mockRejectedValueOnce(error));

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await alertText()).toBe(message);
    expect(screen.queryByRole("button", { name: "Create account instead" })).toBeNull();
    expect(screen.getByRole("button", { name: "Log in" })).toHaveProperty("disabled", false);
    expect(screen.getByLabelText("Email")).toHaveProperty("value", email);
    expect(onClose).not.toHaveBeenCalled();
  });
});
