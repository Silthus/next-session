import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayerCalendar } from "./PlayerCalendar";

type Props = ComponentProps<typeof PlayerCalendar>;

const today = "2026-10-04";

function everyDayFrom(first: number, last: number, month = "2026-10") {
  return Object.fromEntries(
    Array.from({ length: last - first + 1 }, (_, i) => [
      `${month}-${String(first + i).padStart(2, "0")}`,
      "busy" as const,
    ]),
  );
}

function renderCalendar(props: Partial<Props> = {}) {
  const handlers = {
    onAnswer: vi.fn(),
    onFillRest: vi.fn(),
    onMonthChange: vi.fn(),
    onNotYou: vi.fn(),
    onHintToggle: vi.fn(),
  };
  const rootRoute = createRootRoute({
    component: () => (
      <PlayerCalendar
        groupName="Thursday Crew"
        playerName="Ana"
        month="2026-10"
        today={today}
        answers={{}}
        sessionDates={[]}
        hintVisible={false}
        {...handlers}
        {...props}
      />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return handlers;
}

async function tile(name: string | RegExp) {
  return await screen.findByRole("button", { name });
}

describe("PlayerCalendar", () => {
  it("says who is answering and lets them switch", async () => {
    const { onNotYou } = renderCalendar();

    expect(await screen.findByRole("heading", { level: 1, name: "Thursday Crew" })).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Not you?" }));

    expect(onNotYou).toHaveBeenCalledOnce();
  });

  it("moves focus to the Group name so screen readers start there", async () => {
    renderCalendar();

    expect(await screen.findByRole("heading", { level: 1, name: "Thursday Crew" })).toBe(
      document.activeElement,
    );
  });

  it("cycles a tile from not set to free, maybe, busy and back", async () => {
    const { onAnswer } = renderCalendar({
      answers: { "2026-10-05": "free", "2026-10-06": "maybe", "2026-10-07": "busy" },
    });

    await userEvent.click(await tile("Sunday, October 4: Not set"));
    await userEvent.click(await tile("Monday, October 5: Free"));
    await userEvent.click(await tile("Tuesday, October 6: Maybe"));
    await userEvent.click(await tile("Wednesday, October 7: Busy"));

    expect(onAnswer.mock.calls).toEqual([
      ["2026-10-04", "free"],
      ["2026-10-05", "maybe"],
      ["2026-10-06", "busy"],
      ["2026-10-07", null],
    ]);
  });

  it("shows each Answer with a glyph as well as a color", async () => {
    renderCalendar({
      answers: { "2026-10-05": "free", "2026-10-06": "maybe", "2026-10-07": "busy" },
    });

    expect((await tile(/October 5/)).textContent).toBe("5✓");
    expect((await tile(/October 6/)).textContent).toBe("6?");
    expect((await tile(/October 7/)).textContent).toBe("7✕");
  });

  it("locks the days before today", async () => {
    const { onAnswer } = renderCalendar({ answers: { "2026-10-01": "free" } });

    const past = await tile("Thursday, October 1: Free");
    expect(past).toHaveProperty("disabled", true);
    await userEvent.click(past);

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("marks a Session with a star and keeps it tappable", async () => {
    renderCalendar({ sessionDates: ["2026-10-16"] });

    const session = await tile("Friday, October 16: Not set, Session");
    expect(session).toHaveProperty("disabled", false);
    expect(session.textContent).toContain("★");
  });

  it("shows progress over the nights left and fills the rest busy", async () => {
    const { onFillRest } = renderCalendar({
      answers: { "2026-10-01": "free", "2026-10-04": "free", "2026-10-05": "maybe" },
    });

    expect(await screen.findByText("2 of 28 nights set")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("7");
    await userEvent.click(screen.getByRole("button", { name: "Mark the other 26 nights busy" }));

    expect(onFillRest.mock.calls).toEqual([["2026-10"]]);
  });

  it("celebrates a done month and offers the next one", async () => {
    const { onMonthChange } = renderCalendar({ answers: everyDayFrom(4, 31) });

    expect(await screen.findByText("All nights set")).toBeTruthy();
    expect(screen.getByText("All set for October ✓")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark the other/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Fill November →" }));

    expect(onMonthChange).toHaveBeenCalledWith("2026-11");
  });

  it("says all set for now at the end of the Booking Window", async () => {
    renderCalendar({ month: "2026-12", answers: everyDayFrom(1, 31, "2026-12") });

    expect(await screen.findByText("All set for now ✓")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Fill / })).toBeNull();
    expect(screen.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);
  });

  it("shows a past month read-only without progress or Fill Rest", async () => {
    const { onMonthChange } = renderCalendar({
      month: "2026-09",
      answers: { "2026-09-10": "free" },
    });

    expect(await screen.findByText("Past · read only")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "September 2026" })).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark the other/ })).toBeNull();
    const grid = screen.getByRole("group", { name: "September 2026" });
    expect(
      within(grid)
        .getAllByRole("button")
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));

    expect(onMonthChange).toHaveBeenCalledWith("2026-10");
  });

  it("goes back a month", async () => {
    const { onMonthChange } = renderCalendar();

    await userEvent.click(await screen.findByRole("button", { name: "Previous month" }));

    expect(onMonthChange).toHaveBeenCalledWith("2026-09");
  });

  it("points at the first open night on a first visit and reopens on ?", async () => {
    const { onHintToggle } = renderCalendar({ hintVisible: true });

    expect(await screen.findByRole("tooltip")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "How it works" }));

    expect(onHintToggle).toHaveBeenCalledOnce();
  });

  it("keeps the tiles out of reach until the month's Answers load", async () => {
    renderCalendar({ answers: undefined });

    expect(await screen.findByRole("heading", { level: 2, name: "October 2026" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /October 4/ })).toBeNull();
  });
});
