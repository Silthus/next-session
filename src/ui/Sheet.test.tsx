import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while closed", () => {
    render(
      <Sheet open={false} title="Keep My group" onClose={() => {}}>
        body
      </Sheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a dialog named by its title that closes on Escape and on the backdrop", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        <p>The player link stays exactly the same.</p>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Keep My group" }).textContent).toContain(
      "The player link stays exactly the same.",
    );
    const dialog = screen.getByRole("dialog", { name: "Keep My group" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await userEvent.click(dialog);
    await userEvent.click(screen.getByText("The player link stays exactly the same."));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opens as a modal and closes the native dialog when the parent closes it", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    expect(showModal).toHaveBeenCalledOnce();
    rerender(
      <Sheet open={false} title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    expect(close).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tells the parent when the browser closes the dialog on its own", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Keep My group" onClose={onClose}>
        body
      </Sheet>,
    );
    screen.getByRole("dialog").dispatchEvent(new Event("close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
