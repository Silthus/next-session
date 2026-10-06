import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "../lib/telemetry";
import { Route as rootRoute } from "./__root";

vi.mock("../lib/telemetry", () => ({ reportError: vi.fn() }));

const failure = new Error("boom");

function renderBrokenPage() {
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
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a page that breaks", () => {
  it("reports the error and offers a reload", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    renderBrokenPage();

    expect(await screen.findByRole("heading", { name: "Something broke" })).toBeTruthy();
    expect(screen.getByText("Reload the page.")).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(failure, { surface: "router" });

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
