import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    setTimeout(() => this.dispatchEvent(new Event("close")), 0);
  });
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows no content while closed", () => {
    render(
      <Sheet open={false} title="Keep My group" onClose={() => {}}>
        body
      </Sheet>,
    );
    expect(screen.queryByText("body")).toBeNull();
    expect(showModal).not.toHaveBeenCalled();
  });

  it("is a dialog named by its title that closes on Escape and on the backdrop", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        <p>The player link stays exactly the same.</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Keep My group" });
    expect(dialog.textContent).toContain("The player link stays exactly the same.");
    expect(showModal).toHaveBeenCalledOnce();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await userEvent.click(dialog);
    await userEvent.click(screen.getByText("The player link stays exactly the same."));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes from the Close button in its header", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("holds the Close button, still focusable, while it is not dismissible", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" dismissible={false} onClose={onClose}>
        body
      </Sheet>,
    );
    const closeButton = screen.getByRole("button", { name: "Close" });

    await userEvent.click(closeButton);

    expect(closeButton.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(closeButton);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores Escape, the backdrop, and a close the browser started while it is not dismissible", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" dismissible={false} onClose={onClose}>
        body
      </Sheet>,
    );
    const dialog = screen.getByRole<HTMLDialogElement>("dialog");

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    closeNatively(dialog);

    expect(onClose).not.toHaveBeenCalled();
    expect(showModal).toHaveBeenCalledTimes(2);
    expect(dialog.open).toBe(true);
  });

  async function pressCloseFromKeyboard() {
    const closeButton = screen.getByRole("button", { name: "Close" });
    for (let presses = 0; presses < 5 && document.activeElement !== closeButton; presses++) {
      await userEvent.tab();
    }
    expect(document.activeElement).toBe(closeButton);
    await userEvent.keyboard("{Enter}");
    return closeButton;
  }

  it("closes from the keyboard on the Close button", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        <input aria-label="Email" />
      </Sheet>,
    );

    await pressCloseFromKeyboard();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("holds the Close button on the keyboard while it is not dismissible", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" dismissible={false} onClose={onClose}>
        <input aria-label="Email" />
      </Sheet>,
    );

    const closeButton = await pressCloseFromKeyboard();

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(closeButton);
  });

  it("stays open when a drag that started inside the panel ends on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        <p>Type your email.</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(screen.getByText("Type your email."));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes the native dialog when the parent closes it, without echoing onClose", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    rerender(
      <Sheet open={false} title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    expect(close).toHaveBeenCalledOnce();
    await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("shows the dialog again when the browser closes it while the parent keeps it open", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    const dialog = screen.getByRole<HTMLDialogElement>("dialog");

    closeNatively(dialog);

    expect(onClose).toHaveBeenCalledOnce();
    expect(showModal).toHaveBeenCalledTimes(2);
    expect(dialog.open).toBe(true);
  });

  it("stays closed when the parent agrees to a close the browser started", () => {
    function Parent() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} title="Keep My group" onClose={() => setOpen(false)}>
          body
        </Sheet>
      );
    }
    render(<Parent />);
    const dialog = screen.getByRole<HTMLDialogElement>("dialog");

    closeNatively(dialog);

    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
    expect(screen.queryByText("body")).toBeNull();
  });
});

function closeNatively(dialog: HTMLDialogElement) {
  dialog.open = false;
  fireEvent(dialog, new Event("close"));
}
