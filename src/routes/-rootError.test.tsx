import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as rootRoute } from "./__root";

const failure = new Error("boom");

async function renderBrokenPage(onCaughtError: (error: unknown) => void) {
  const brokenPage = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => {
      throw failure;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([brokenPage]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container, { onCaughtError });
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await Promise.resolve();
  });
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("a page that breaks", () => {
  it("hands the error to React's onCaughtError once and offers a reload", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onCaughtError = vi.fn();
    const root = await renderBrokenPage(onCaughtError);

    expect(await screen.findByRole("heading", { name: "Something broke" })).toBeTruthy();
    expect(screen.getByText("Reload the page.")).toBeTruthy();
    expect(onCaughtError).toHaveBeenCalledOnce();
    expect(onCaughtError).toHaveBeenCalledWith(failure, expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(reload).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
