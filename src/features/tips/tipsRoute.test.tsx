import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "../../routeTree.gen";

const confirmTips = vi.fn(() => Promise.resolve({ confirmed: true, alreadyConfirmed: false }));

vi.mock("convex/react", () => ({
  useMutation: () => confirmTips,
}));

beforeEach(() => {
  confirmTips.mockClear();
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("/tips", () => {
  it("takes the code out of the address bar on load and calls nothing", async () => {
    const router = renderAt("/tips?confirm=the-code");

    await screen.findByRole("button", { name: "Yes, send me the tips" });

    expect(router.state.location.href).toBe("/tips");
    expect(confirmTips).not.toHaveBeenCalled();
    expect(document.title).toBe("Two short tips? · Next Session");
  });

  it("confirms with the code it took from the address bar", async () => {
    renderAt("/tips?confirm=the-code");

    await userEvent.click(await screen.findByRole("button", { name: "Yes, send me the tips" }));

    expect(confirmTips).toHaveBeenCalledExactlyOnceWith({ code: "the-code" });
  });
});
