import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { NotFoundScreen, type NotFoundKind } from "./NotFoundScreen";

function renderInRouter(element: ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => element }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("NotFoundScreen", () => {
  it.each<{ kind: NotFoundKind; headline: string; explanation: RegExp }>([
    {
      kind: "link",
      headline: "This link no longer works",
      explanation: /rotated the link or deleted the group/,
    },
    {
      kind: "page",
      headline: "Nothing here",
      explanation: /The page you were looking for does not exist\./,
    },
  ])(
    "says $headline for a $kind, takes focus, and points home",
    async ({ kind, headline, explanation }) => {
      renderInRouter(<NotFoundScreen kind={kind} />);

      const heading = await screen.findByRole("heading", { level: 1, name: headline });
      expect(heading).toBe(document.activeElement);
      expect(screen.getByText(explanation)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Plan your own game" })).toHaveProperty(
        "pathname",
        "/",
      );
    },
  );

  it("titles the document after a dead link", async () => {
    renderInRouter(<NotFoundScreen kind="link" />);

    await waitFor(() => expect(document.title).toBe("This link no longer works · Next Session"));
  });
});
