import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routeTree } from "../routeTree.gen";

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("legal routes", () => {
  it.each([
    ["/terms", "Terms of Use", /Groups without an account/],
    ["/privacy", "Privacy Policy", /What we process/],
    ["/imprint", "Imprint", "Consumer dispute resolution"],
  ])(
    "%s renders the document from docs/legal with every placeholder filled",
    async (path, title, section) => {
      renderAt(path);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeTruthy();
      expect(document.body.textContent).not.toContain("{{");
      expect(document.body.textContent).toContain("address on request");
      expect(screen.getAllByRole("link", { name: "Imprint" }).at(-1)).toHaveProperty(
        "pathname",
        "/imprint",
      );
    },
  );
});

describe("/privacy", () => {
  it("renders the effective date, the processor table, the storage list and the authority link", async () => {
    renderAt("/privacy");
    expect(await screen.findByText("Updated 2026-10-03")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Convex, Inc." })).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("link", { name: "https://www.lda.bayern.de" })).toHaveProperty(
      "href",
      "https://www.lda.bayern.de/",
    );
  });
});

describe("unknown paths", () => {
  it("show the not-found page with a link home", async () => {
    renderAt("/nothing-here");
    expect(await screen.findByRole("heading", { level: 1, name: "Nothing here" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan your own game" })).toHaveProperty(
      "pathname",
      "/",
    );
  });
});
