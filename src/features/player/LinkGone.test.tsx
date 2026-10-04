import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkGone } from "./LinkGone";

describe("LinkGone", () => {
  it("says the link no longer works, takes focus, and points to a new link", async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: LinkGone }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "This link no longer works",
    });
    expect(heading).toBe(document.activeElement);
    expect(screen.getByRole("link", { name: "Plan your own game" })).toHaveProperty(
      "pathname",
      "/",
    );
  });
});
