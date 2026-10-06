import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveInput } from "./save";
import { AccountSheet } from "./AccountSheet";

type Submit = (input: SaveInput) => Promise<unknown>;

type SheetProps = ComponentProps<typeof AccountSheet>;

function renderSheet(props: SheetProps) {
  let replaceProps: (next: SheetProps) => void = () => {};
  function Harness() {
    const [current, setCurrent] = useState(props);
    replaceProps = setCurrent;
    return <AccountSheet {...current} />;
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Harness }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return (next: SheetProps) => act(() => replaceProps(next));
}

function renderSaveSheet(onSubmit: Submit, onClose = vi.fn()) {
  renderSheet({
    open: true,
    intent: "save",
    groupName: "My group",
    onSubmit,
    onFinish: vi.fn(),
    onClose,
  });
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
    const closeButton = screen.getByRole("button", { name: "Close" });
    await userEvent.click(closeButton);

    expect(onClose).not.toHaveBeenCalled();
    expect(closeButton.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("radio", { name: "I already have one" }).matches(":disabled")).toBe(
      true,
    );
    expect(screen.getByLabelText("Email")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("Password")).toHaveProperty("readOnly", true);
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

describe("AccountSheet keeping a Group as a Player", () => {
  function renderKeepSheet(onSubmit: Submit, movesGroups = false, onClose = vi.fn()) {
    renderSheet({
      open: true,
      intent: "keep",
      groupName: "Thursday Crew",
      playerName: "Ana",
      movesGroups,
      onSubmit,
      onClose,
    });
    return onClose;
  }

  it("creates an Account first, with the legal line, and closes once kept", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = renderKeepSheet(onSubmit);

    expect(await screen.findByRole("heading", { name: "Keep Thursday Crew" })).toBeTruthy();
    expect(screen.getByText("Open it as Ana on any device.")).toBeTruthy();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent),
    ).toEqual(["Create account", "I already have one"]);
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveProperty(
      "pathname",
      "/privacy",
    );
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Keep group" }));

    expect(onSubmit).toHaveBeenCalledWith({ email, password, mode: "create" });
    expect(onClose).toHaveBeenCalled();
  });

  it("logs in to an existing Account second", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    renderKeepSheet(onSubmit);

    await userEvent.click(await screen.findByRole("radio", { name: "I already have one" }));
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Log in and keep" }));

    expect(onSubmit).toHaveBeenCalledWith({ email, password, mode: "logIn" });
  });

  it("tells an Anonymous GM that their own groups move to the Account too", async () => {
    let finish: () => void = () => {};
    renderKeepSheet(
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
      true,
    );

    expect(await screen.findByText("Your own groups move to the account too.")).toBeTruthy();
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Keep group" }));

    expect(screen.getByRole("button", { name: "Keeping…" })).toHaveProperty("disabled", true);
    finish();
  });
});

describe("AccountSheet finishing a Save after the sign-in went through", () => {
  it("asks only to finish, as the signed-in Account, once the move failed", async () => {
    let failMove: (error: Error) => void = () => {};
    const onSubmit = vi.fn<Submit>(() => new Promise((_, reject) => (failMove = reject)));
    const onFinish = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    const props = {
      open: true,
      intent: "save",
      groupName: "My group",
      onSubmit,
      onFinish,
      onClose,
    } as const;
    const replaceProps = renderSheet(props);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));
    replaceProps({ ...props, signedInAs: email });
    expect(screen.getByLabelText("Email")).toHaveProperty("value", email);
    act(() => failMove(new Error("Server Error")));

    expect(await alertText()).toBe("That didn't work. Try again.");
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByText(email).closest("p")?.textContent).toBe(
      `Signed in as ${email}. Finish moving My group to your account.`,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Finish saving" }));
    await userEvent.click(screen.getByRole("button", { name: "Finish saving" }));

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it("says when the Save expired before the Group moved", async () => {
    renderSheet({
      open: true,
      intent: "save",
      groupName: "My group",
      signedInAs: email,
      onSubmit: vi.fn(),
      onFinish: () => Promise.reject(new ConvexError({ code: "CLAIM_INVALID" })),
      onClose: vi.fn(),
    });

    await userEvent.click(await screen.findByRole("button", { name: "Finish saving" }));

    expect(await alertText()).toBe(
      "This save expired before the group moved. Close this and create a new link.",
    );
  });

  it("finishes in the background when the GM closes it", async () => {
    const onFinish = vi.fn(() => Promise.reject(new Error("Server Error")));
    const onClose = vi.fn();
    renderSheet({
      open: true,
      intent: "save",
      groupName: "My group",
      signedInAs: email,
      onSubmit: vi.fn(),
      onFinish,
      onClose,
    });

    await userEvent.click(await screen.findByRole("button", { name: "Close" }));

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers only to close once the Save expired", async () => {
    const onFinish = vi.fn(() => Promise.reject(new ConvexError({ code: "CLAIM_INVALID" })));
    const onClose = vi.fn();
    renderSheet({
      open: true,
      intent: "save",
      groupName: "My group",
      signedInAs: email,
      onSubmit: vi.fn(),
      onFinish,
      onClose,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Finish saving" }));
    await screen.findByRole("alert");

    expect(screen.queryByRole("button", { name: "Finish saving" })).toBeNull();
    const primaryClose = screen
      .getAllByRole<HTMLButtonElement>("button", { name: "Close" })
      .find((button) => button.type === "submit");
    await userEvent.click(primaryClose!);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("offers only to close when the first Save expired after the sign-in", async () => {
    let failMove: (error: Error) => void = () => {};
    const props = {
      open: true,
      intent: "save",
      groupName: "My group",
      onSubmit: vi.fn<Submit>(() => new Promise((_, reject) => (failMove = reject))),
      onFinish: vi.fn(),
      onClose: vi.fn(),
    } as const;
    const replaceProps = renderSheet(props);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));
    replaceProps({ ...props, signedInAs: email });
    act(() => failMove(new ConvexError({ code: "CLAIM_INVALID" })));
    await screen.findByRole("alert");

    expect(screen.queryByRole("button", { name: "Finish saving" })).toBeNull();
    const primary = screen
      .getAllByRole<HTMLButtonElement>("button")
      .find((button) => button.type === "submit");
    expect(primary?.textContent).toBe("Close");
  });
});

const roomForGroups =
  "An account holds up to 50 groups. Delete some to make room, then finish saving.";

describe("AccountSheet with an Account that holds too many Groups", () => {
  it("says to make room before saving", async () => {
    renderSaveSheet(() => Promise.reject(new ConvexError({ code: "TOO_MANY_GROUPS" })));
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(await alertText()).toBe(roomForGroups);
  });
});

describe("AccountSheet reopened by a Save that failed on the way back from Google", () => {
  function renderRefusedSave(refusal: unknown) {
    renderSheet({
      open: true,
      intent: "save",
      groupName: "your group",
      signedInAs: email,
      refusal,
      onSubmit: vi.fn(),
      onFinish: vi.fn(),
      onClose: vi.fn(),
    });
  }

  it("opens on the reason the move failed, with Finish saving to retry", async () => {
    renderRefusedSave(new ConvexError({ code: "TOO_MANY_GROUPS" }));

    expect(await alertText()).toBe(roomForGroups);
    expect(screen.getByRole("button", { name: "Finish saving" })).toBeTruthy();
  });

  it("opens on an expired Save, offering only to close", async () => {
    renderRefusedSave(new ConvexError({ code: "CLAIM_INVALID" }));

    expect(await alertText()).toBe(
      "This save expired before the group moved. Close this and create a new link.",
    );
    expect(screen.queryByRole("button", { name: "Finish saving" })).toBeNull();
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

  it("tells a Player they can answer without an Account", async () => {
    renderSheet({
      open: true,
      intent: "logIn",
      forPlayer: true,
      onSubmit: vi.fn(),
      onClose: vi.fn(),
    });

    expect(await screen.findByText("Open the groups you kept on this device.")).toBeTruthy();
    expect(screen.getByText(/No account yet\?/).textContent).toBe(
      "No account yet? You can answer without one.",
    );
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
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

describe("AccountSheet with Google", () => {
  const google = { name: "Continue with Google" };

  it("offers Google only once the deployment has it", async () => {
    renderSheet({ open: true, intent: "logIn", onSubmit: vi.fn(), onClose: vi.fn() });
    await screen.findByRole("heading", { name: "Log in" });
    expect(screen.queryByRole("button", google)).toBeNull();
  });

  it.each([
    ["saving a Group", "save"],
    ["logging in", "logIn"],
  ] as const)("continues with Google %s, under the legal line", async (_, intent) => {
    const onContinueWithGoogle = vi.fn(() => new Promise(() => {}));
    renderSheet({
      open: true,
      intent,
      groupName: "My group",
      onSubmit: vi.fn(),
      onFinish: vi.fn(),
      onClose: vi.fn(),
      onContinueWithGoogle,
    });

    await userEvent.click(await screen.findByRole("button", google));

    expect(onContinueWithGoogle).toHaveBeenCalled();
    expect(screen.getByText(/By continuing with Google/).textContent).toBe(
      "By continuing with Google you agree to the Terms and Privacy Policy.",
    );
    expect(screen.getByRole("button", { name: "Opening Google…" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByLabelText("Email")).toHaveProperty("readOnly", true);
  });

  it("keeps the email form shut while leaving for Google", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    renderSheet({
      open: true,
      intent: "logIn",
      onSubmit,
      onClose: vi.fn(),
      onContinueWithGoogle: () => new Promise(() => {}),
    });
    await fillIn();

    await userEvent.click(screen.getByRole("button", google));
    await userEvent.type(screen.getByLabelText("Password"), "{Enter}");

    expect(screen.getByRole("button", { name: "Log in" })).toHaveProperty("disabled", true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("wakes up again when the browser brings the page back from Google", async () => {
    renderSheet({
      open: true,
      intent: "logIn",
      onSubmit: vi.fn(),
      onClose: vi.fn(),
      onContinueWithGoogle: () => new Promise(() => {}),
    });
    await userEvent.click(await screen.findByRole("button", google));

    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });

    expect(screen.getByRole("button", google)).toHaveProperty("disabled", false);
    expect(screen.getByLabelText("Email")).toHaveProperty("readOnly", false);
  });

  it("stays open and says so when leaving for Google fails", async () => {
    const onClose = vi.fn();
    renderSheet({
      open: true,
      intent: "save",
      groupName: "My group",
      onSubmit: vi.fn(),
      onFinish: vi.fn(),
      onClose,
      onContinueWithGoogle: () => Promise.reject(new ConvexError({ code: "RATE_LIMITED" })),
    });

    await userEvent.click(await screen.findByRole("button", google));

    expect(await alertText()).toBe("Too many tries. Try again in a minute.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", google)).toHaveProperty("disabled", false);
  });
});
