import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "../../lib/telemetry";
import { RemindersOff, type RemindersStatus } from "./RemindersOff";

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  reportError: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(reportError).mockReset();
});

type Switch = () => Promise<null>;

function liveStatus(initial: RemindersStatus) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change: (next: RemindersStatus) => {
      current = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function renderPage(
  initial: RemindersStatus,
  {
    turnOff = vi.fn<Switch>(),
    turnOn = vi.fn<Switch>(),
    landsOn,
  }: { turnOff?: Switch; turnOn?: Switch; landsOn?: RemindersStatus } = {},
) {
  const status = liveStatus(initial);
  const switchTo = (enabled: boolean, press: Switch) => async () => {
    await press();
    status.change(landsOn ?? { enabled });
  };
  function Page() {
    return (
      <RemindersOff
        status={useSyncExternalStore(status.subscribe, status.read)}
        turnOff={switchTo(false, turnOff)}
        turnOn={switchTo(true, turnOn)}
      />
    );
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory({ initialEntries: ["/reminders/off"] }),
  });
  render(<RouterProvider router={router} />);
  return { turnOff, turnOn, status };
}

const turnOffButton = { name: "Turn off Reminders" };
const turnOnButton = { name: "Turn them back on" };
const myGroupsLink = { name: "Open My groups" };

async function heading() {
  return await screen.findByRole("heading", { level: 1 });
}

describe("RemindersOff", () => {
  it("asks before it turns Reminders off and calls nothing until the press", async () => {
    const { turnOff, turnOn } = renderPage({ enabled: true });

    expect((await heading()).textContent).toBe("Turn off Reminders?");
    expect(
      screen.getByText(
        "You get an email 1 day and 2 hours before each session. Session updates stay as they are.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("button")).toEqual([screen.getByRole("button", turnOffButton)]);
    expect(turnOff).not.toHaveBeenCalled();
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("turns Reminders off on the press and offers to turn them back on", async () => {
    const turnOff = vi.fn<Switch>(() => Promise.resolve(null));
    const { turnOn } = renderPage({ enabled: true }, { turnOff });

    await userEvent.click(await screen.findByRole("button", turnOffButton));

    expect(turnOff).toHaveBeenCalledOnce();
    const offHeading = await screen.findByRole("heading", { level: 1, name: "Reminders are off" });
    expect(document.activeElement).toBe(offHeading);
    expect(screen.getByRole("button", turnOnButton)).toBeTruthy();
    expect(screen.getByRole("link", myGroupsLink).getAttribute("href")).toBe("/me");
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("says Reminders are off when they already are, and calls nothing", async () => {
    const { turnOff, turnOn } = renderPage({ enabled: false });

    expect((await heading()).textContent).toBe("Reminders are off");
    expect(screen.getByRole("button", turnOnButton)).toBeTruthy();
    expect(screen.getByRole("link", myGroupsLink)).toBeTruthy();
    expect(turnOff).not.toHaveBeenCalled();
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("turns Reminders back on from the same page and asks again", async () => {
    const turnOn = vi.fn<Switch>(() => Promise.resolve(null));
    renderPage({ enabled: false }, { turnOn });

    await userEvent.click(await screen.findByRole("button", turnOnButton));

    expect(turnOn).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Turn off Reminders?" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", turnOffButton)).toBeTruthy();
  });

  it("says an unknown link doesn't work and points to My groups", async () => {
    const { turnOff, turnOn } = renderPage(null);

    expect((await heading()).textContent).toBe("This link doesn't work");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", myGroupsLink).getAttribute("href")).toBe("/me");
    expect(turnOff).not.toHaveBeenCalled();
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("asks for the link again when the page has none, and calls nothing", async () => {
    const { turnOff, turnOn } = renderPage("no link");

    expect((await heading()).textContent).toBe("Open the link in your Reminder");
    expect(
      screen.getByText(
        "Use the link at the foot of a Reminder again, or sign in to turn Reminders off or on from My groups.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", myGroupsLink).getAttribute("href")).toBe("/me");
    expect(turnOff).not.toHaveBeenCalled();
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("follows a change made elsewhere after the press", async () => {
    const { status } = renderPage(
      { enabled: true },
      { turnOff: vi.fn<Switch>(() => Promise.resolve(null)) },
    );
    await userEvent.click(await screen.findByRole("button", turnOffButton));
    await screen.findByRole("heading", { level: 1, name: "Reminders are off" });

    act(() => status.change({ enabled: true }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Turn off Reminders?" }),
    ).toBeTruthy();
  });

  it("offers the button again when another device switched Reminders back meanwhile", async () => {
    renderPage(
      { enabled: true },
      { turnOff: vi.fn<Switch>(() => Promise.resolve(null)), landsOn: { enabled: true } },
    );

    await userEvent.click(await screen.findByRole("button", turnOffButton));

    await waitFor(() =>
      expect(screen.getByRole("button", turnOffButton).hasAttribute("disabled")).toBe(false),
    );
  });

  it("shows nothing to press while the link is being read", () => {
    renderPage(undefined);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("keeps the button for another try when the link is rate limited", async () => {
    const turnOff = vi
      .fn<Switch>()
      .mockRejectedValueOnce(new ConvexError({ code: "RATE_LIMITED", retryAfter: 2_000 }))
      .mockResolvedValueOnce(null);
    renderPage({ enabled: true }, { turnOff });

    await userEvent.click(await screen.findByRole("button", turnOffButton));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Slow down a moment, then try again.",
    );
    await userEvent.click(screen.getByRole("button", turnOffButton));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Reminders are off" }),
    ).toBeTruthy();
  });

  it("says what went wrong without the server's words", async () => {
    renderPage({ enabled: true }, { turnOff: () => Promise.reject(new Error("Server Error")) });

    await userEvent.click(await screen.findByRole("button", turnOffButton));

    expect((await screen.findByRole("alert")).textContent).toBe("That didn't work. Try again.");
  });

  it("presses once while the change is on its way", async () => {
    const turnOff = vi.fn<Switch>(() => new Promise(() => {}));
    renderPage({ enabled: true }, { turnOff });

    await userEvent.click(await screen.findByRole("button", turnOffButton));
    await userEvent.click(screen.getByRole("button"));

    expect(turnOff).toHaveBeenCalledTimes(1);
  });
});
