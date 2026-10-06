import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  init: vi.fn(() => ({
    register: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })),
}));

vi.mock("posthog-js/dist/module.slim", () => ({ default: posthog }));
vi.mock("posthog-js/dist/extension-bundles", () => ({
  AnalyticsExtensions: {},
  ErrorTrackingExtensions: {},
  LogsExtensions: {},
}));

async function openPrivacyPage() {
  vi.resetModules();
  const { routeTree } = await import("../../routeTree.gen");
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/privacy"] }),
  });
  const page = render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });
  return page;
}

beforeEach(() => {
  localStorage.clear();
  posthog.init.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the usage measurement switch on /privacy", () => {
  it("is absent from a build without usage measurement", async () => {
    await openPrivacyPage();

    expect(screen.queryByRole("heading", { name: "Usage measurement" })).toBeNull();
  });

  it("turns measurement off for this browser, remembers it, and turns it back on", async () => {
    vi.stubEnv("VITE_POSTHOG_TOKEN", "phc_test");
    const first = await openPrivacyPage();
    expect(screen.getByRole("status").textContent).toBe("Usage measurement is on in this browser.");

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off usage measurement in this browser" }),
    );

    expect(screen.getByRole("status").textContent).toBe(
      "Usage measurement is off in this browser.",
    );
    first.unmount();
    await openPrivacyPage();
    expect(screen.getByRole("status").textContent).toBe(
      "Usage measurement is off in this browser.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Turn it back on" }));

    expect(screen.getByRole("status").textContent).toBe("Usage measurement is on in this browser.");
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalledOnce());
  });

  it("stays off for the visit when the browser refuses to store the choice", async () => {
    vi.stubEnv("VITE_POSTHOG_TOKEN", "phc_test");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    await openPrivacyPage();

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off usage measurement in this browser" }),
    );

    const telemetry = await import("../../lib/telemetry");
    expect(telemetry.measurementIsOn()).toBe(false);
    expect(screen.getByRole("status").textContent).toBe(
      "Usage measurement is off in this browser.",
    );
  });
});
