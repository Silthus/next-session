import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("tells the parent when the browser closes the dialog on its own", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
