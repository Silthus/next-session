import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
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
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
