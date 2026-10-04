import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { LandingView } from "./LandingView";

type Props = ComponentProps<typeof LandingView>;

function renderLanding(overrides: Partial<Props> = {}) {
  const props: Props = {
    state: { phase: "idle" },
    showLogIn: true,
    onCreate: vi.fn(),
    onLogIn: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <LandingView {...props} /> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return { props, router };
}

const created = {
  phase: "created",
  shareUrl: "https://next-session.link/s/k3Qx9Lm2aB",
  groupId: "group-1",
} as const;

describe("LandingView", () => {
  it("creates the link with one click, which accepts the Terms and the Privacy Policy", async () => {
    const { props } = renderLanding();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Stop chasing the date." }),
    ).toBeTruthy();
    const legalLine = within(screen.getByText(/No sign-up. By creating a link you agree to the/));
    expect(legalLine.getByRole("link", { name: "Terms" })).toHaveProperty("pathname", "/terms");
    expect(legalLine.getByRole("link", { name: "Privacy Policy" })).toHaveProperty(
      "pathname",
      "/privacy",
    );

    await userEvent.click(screen.getByRole("button", { name: "Create your link" }));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it("opens the log in sheet from the header", async () => {
    const { props } = renderLanding();
    await userEvent.click(await screen.findByRole("button", { name: "Log in" }));
    expect(props.onLogIn).toHaveBeenCalledOnce();
  });

  it("hides Log in from a GM who is already signed in", async () => {
    renderLanding({ showLogIn: false });
    await screen.findByRole("button", { name: "Create your link" });
    expect(screen.queryByRole("button", { name: "Log in" })).toBeNull();
  });

  it("names the account a GM just logged in to and nudges them to their first link", async () => {
    renderLanding({ showLogIn: false, loggedInAs: "gm@example.test" });

    const line = await screen.findByRole("status");
    expect(line.textContent).toBe(
      "Logged in as gm@example.test. No groups here yet, so create your first link.",
    );
    expect(document.activeElement).toBe(line);
    expect(screen.getByRole("button", { name: "Create your link" })).toBeTruthy();
  });

  it("holds the button while the link is being made", async () => {
    renderLanding({ state: { phase: "creating" } });
    expect(await screen.findByRole("button", { name: "Making your link…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it.each([
    [
      new ConvexError({ code: "RATE_LIMITED", retryAfter: 2_000 }),
      "Slow down a moment, then try again.",
    ],
    [new Error("Server Error"), "That didn't work. Try again."],
  ])("says why making the link failed and lets the GM try again", async (error, message) => {
    const { props } = renderLanding({ state: { phase: "failed", error } });
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    await userEvent.click(screen.getByRole("button", { name: "Create your link" }));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it("puts the link in hand in place of the button", async () => {
    renderLanding({ state: created });

    const ready = await screen.findByText("Your link is ready. Send it to your players.");
    expect(document.activeElement).toBe(ready);
    expect(screen.getByText("next-session.link/s/k3Qx9Lm2aB")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share via WhatsApp" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create your link" })).toBeNull();
  });

  it("opens the Group from the link-created moment", async () => {
    const { router } = renderLanding({ state: created });

    const open = await screen.findByRole("link", { name: "Open your group →" });
    expect(open.getAttribute("href")).toBe("/g/group-1");

    await userEvent.click(open);
    expect(router.state.location.pathname).toBe("/g/group-1");
  });

  it("offers to save the new Group to an account", async () => {
    const { props } = renderLanding({ state: created });
    await userEvent.click(await screen.findByRole("button", { name: "save it to an account" }));
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("names the account once the Group is saved", async () => {
    renderLanding({ state: { ...created, savedAs: "gm@example.test" } });
    expect((await screen.findByRole("status")).textContent).toBe("Saved to gm@example.test.");
    expect(screen.queryByRole("button", { name: "save it to an account" })).toBeNull();
  });
});
