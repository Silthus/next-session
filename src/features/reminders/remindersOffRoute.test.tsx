import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "../../routeTree.gen";

const mutations = {
  "reminderLinks:turnOff": vi.fn(() => Promise.resolve(null)),
  "reminderLinks:turnOn": vi.fn(() => Promise.resolve(null)),
};
const status = vi.fn((_name: string, _args: unknown) => ({ enabled: true }));

vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: unknown) =>
    args === "skip" ? undefined : status(getFunctionName(query), args),
  useMutation: (mutation: FunctionReference<"mutation">) =>
    mutations[getFunctionName(mutation) as keyof typeof mutations],
}));

beforeEach(() => {
  status.mockClear();
  Object.values(mutations).forEach((mutation) => mutation.mockClear());
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("/reminders/off", () => {
  it("takes the token out of the address bar on load, reads the link and changes nothing", async () => {
    const router = renderAt("/reminders/off?t=the-token");

    await screen.findByRole("button", { name: "Turn off Reminders" });

    expect(router.state.location.href).toBe("/reminders/off");
    expect(status).toHaveBeenCalledWith("reminderLinks:status", { token: "the-token" });
    expect(mutations["reminderLinks:turnOff"]).not.toHaveBeenCalled();
    expect(mutations["reminderLinks:turnOn"]).not.toHaveBeenCalled();
    expect(document.title).toBe("Turn off Reminders? · Next Session");
  });

  it("turns Reminders off with the token it took from the address bar", async () => {
    renderAt("/reminders/off?t=the-token");

    await userEvent.click(await screen.findByRole("button", { name: "Turn off Reminders" }));

    expect(mutations["reminderLinks:turnOff"]).toHaveBeenCalledExactlyOnceWith({
      token: "the-token",
    });
  });

  it("says the link doesn't work without a token and reads nothing", async () => {
    renderAt("/reminders/off");

    expect(
      await screen.findByRole("heading", { level: 1, name: "This link doesn't work" }),
    ).toBeTruthy();
    expect(status).not.toHaveBeenCalled();
  });
});
