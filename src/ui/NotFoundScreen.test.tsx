import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotFoundScreen } from "./NotFoundScreen";

function renderScreen(screenElement: React.ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => screenElement }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("NotFoundScreen", () => {
  it("says the link no longer works, takes focus, and points to a new link", async () => {
    renderScreen(<NotFoundScreen kind="link" />);

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "This link no longer works",
    });
    expect(heading).toBe(document.activeElement);
    expect(screen.getByText(/rotated the link or deleted the group/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan your own game" })).toHaveProperty(
      "pathname",
      "/",
    );
    await waitFor(() => expect(document.title).toBe("This link no longer works · Next Session"));
  });

  it("says a page does not exist", async () => {
    renderScreen(<NotFoundScreen kind="page" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Nothing here" })).toBeTruthy();
    expect(screen.getByText("The page you were looking for does not exist.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan your own game" })).toHaveProperty(
      "pathname",
      "/",
    );
  });
});
