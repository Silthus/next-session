import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "../routeTree.gen";

vi.mock("../features/landing/Landing", () => ({ Landing: () => <main>Landing</main> }));

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.stubEnv("LEGAL_CONTROLLER_ADDRESS", "Somewhere 1, 12345 Town");
  vi.stubEnv("LEGAL_CONTACT_EMAIL", "hello@example.test");
});

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
      expect(document.body.textContent).toContain("Somewhere 1, 12345 Town");
      expect(document.body.textContent).toContain("hello@example.test");
      expect(screen.getAllByRole("link", { name: "Imprint" }).at(-1)).toHaveProperty(
        "pathname",
        "/imprint",
      );
      expect(screen.getAllByRole("link", { name: "Terms" }).at(-1)).toHaveProperty(
        "pathname",
        "/terms",
      );
      expect(screen.getAllByRole("link", { name: "Privacy" }).at(-1)).toHaveProperty(
        "pathname",
        "/privacy",
      );
      expect(screen.getByRole("link", { name: "Next Session home" })).toHaveProperty(
        "pathname",
        "/",
      );
      expect(document.title).toBe(`${title} · Next Session`);
      expect(screen.getAllByRole("link", { name: "hello@example.test" })[0]).toHaveProperty(
        "href",
        "mailto:hello@example.test",
      );
    },
  );
});

describe("document titles", () => {
  it("names the landing page after the product", async () => {
    renderAt("/");
    expect(await screen.findByRole("main")).toBeTruthy();
    expect(document.title).toBe("Next Session");
  });
});

describe("/privacy", () => {
  it("renders the effective date, the processor table, the storage list and the authority link", async () => {
    renderAt("/privacy");
    expect(await screen.findByText("Updated Oct 7, 2026")).toBeTruthy();
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
    expect(document.title).toBe("Nothing here · Next Session");
  });
});
