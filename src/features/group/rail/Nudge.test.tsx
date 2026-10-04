import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Nudge } from "./Nudge";

it("asks the GM to save once players joined, or to come back later", async () => {
  const onSave = vi.fn();
  const onLater = vi.fn();
  render(<Nudge names={["Ana", "Ben", "Chiara"]} onSave={onSave} onLater={onLater} />);
  const nudge = screen.getByRole("region", { name: "Save your group" });
  expect(nudge.textContent).toContain("Ana, Ben and 1 more joined.");
  expect(nudge.textContent).toContain("Unsaved groups vanish after 30 quiet days.");

  await userEvent.click(screen.getByRole("button", { name: "Save group" }));
  expect(onSave).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(onLater).toHaveBeenCalledOnce();
});
