import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIPS_CONSENT_WORDING } from "../../../shared/tips";
import { reportError } from "../../lib/telemetry";
import { ConfirmTips } from "./ConfirmTips";

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  reportError: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(reportError).mockReset();
});

type Confirm = (code: string) => Promise<{ confirmed: boolean }>;

function renderPage(code: string | undefined, confirm: Confirm) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <ConfirmTips code={code} confirm={confirm} /> }),
    history: createMemoryHistory({ initialEntries: ["/tips"] }),
  });
  render(<RouterProvider router={router} />);
}

const yes = { name: "Yes, send me the tips" };

describe("ConfirmTips", () => {
  it("shows the box's wording and one button, and calls nothing until it is pressed", async () => {
    const confirm = vi.fn<Confirm>();

    renderPage("the-code", confirm);

    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText(TIPS_CONSENT_WORDING, { exact: false })).toBeTruthy();
    expect(screen.getAllByRole("button")).toEqual([screen.getByRole("button", yes)]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms with the code on the press and says when the first tip arrives", async () => {
    const confirm = vi.fn<Confirm>(() => Promise.resolve({ confirmed: true }));
    renderPage("the-code", confirm);

    await userEvent.click(await screen.findByRole("button", yes));

    expect(confirm).toHaveBeenCalledExactlyOnceWith("the-code");
    expect((await screen.findByRole("status")).textContent).toBe(
      "Done. The first tip arrives in two days.",
    );
    expect(screen.queryByRole("button", yes)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });

  it("says the link expired when the server refuses the code", async () => {
    renderPage("the-code", () => Promise.resolve({ confirmed: false }));

    await userEvent.click(await screen.findByRole("button", yes));

    expect((await screen.findByRole("status")).textContent).toBe(
      "This link has expired. That's fine, you'll just get no tips.",
    );
    expect(screen.queryByRole("button", yes)).toBeNull();
  });

  it("presses once while the confirmation is on its way", async () => {
    const confirm = vi.fn<Confirm>(() => new Promise(() => {}));
    renderPage("the-code", confirm);

    await userEvent.click(await screen.findByRole("button", yes));
    await userEvent.click(screen.getByRole("button"));

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the button for another try when the press fails", async () => {
    const confirm = vi
      .fn<Confirm>()
      .mockRejectedValueOnce(new ConvexError({ code: "RATE_LIMITED", retryAfter: 2_000 }))
      .mockResolvedValueOnce({ confirmed: true });
    renderPage("the-code", confirm);

    await userEvent.click(await screen.findByRole("button", yes));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Slow down a moment, then try again.",
    );
    await userEvent.click(screen.getByRole("button", yes));

    expect((await screen.findByRole("status")).textContent).toMatch(/^Done\./);
  });

  it("says what went wrong without the server's words when the press fails unexpectedly", async () => {
    renderPage("the-code", () => Promise.reject(new Error("Server Error")));

    await userEvent.click(await screen.findByRole("button", yes));

    expect((await screen.findByRole("alert")).textContent).toBe("That didn't work. Try again.");
  });

  it("offers no button without a code and points back to the mail", async () => {
    const confirm = vi.fn<Confirm>();

    renderPage(undefined, confirm);

    expect(
      await screen.findByText("Open the link in your welcome mail again to confirm."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", yes)).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
});
