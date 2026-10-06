import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Answer } from "../../../shared/answers";
import { PlayerCalendar } from "./PlayerCalendar";

type Props = ComponentProps<typeof PlayerCalendar>;

const today = "2026-10-04";

function withAnswer(answers: Record<string, Answer>, date: string, answer: Answer | null) {
  const next = { ...answers };
  if (answer === null) delete next[date];
  else next[date] = answer;
  return next;
}

function everyDayFrom(first: number, last: number, month = "2026-10") {
  return Object.fromEntries(
    Array.from({ length: last - first + 1 }, (_, i) => [
      `${month}-${String(first + i).padStart(2, "0")}`,
      "busy" as const,
    ]),
  );
}

function renderInRouter(node: () => ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

function calendarProps(props: Partial<Props> = {}): Props {
  return {
    groupName: "Thursday Crew",
    playerName: "Ana",
    month: "2026-10",
    today,
    answers: {},
    sessionDates: [],
    hintVisible: false,
    onAnswer: vi.fn(),
    onFillRest: vi.fn(() => Promise.resolve(null)),
    onMonthChange: vi.fn(),
    onNotYou: vi.fn(),
    onHintToggle: vi.fn(),
    keep: "offer",
    keepOffered: false,
    keepRefusal: null,
    onKeep: vi.fn(),
    ...props,
  };
}

function renderCalendar(overrides: Partial<Props> = {}) {
  const handlers = {
    onAnswer: vi.fn<Props["onAnswer"]>(),
    onFillRest: vi.fn<Props["onFillRest"]>(() => Promise.resolve(null)),
    onMonthChange: vi.fn<Props["onMonthChange"]>(),
    onNotYou: vi.fn<Props["onNotYou"]>(),
    onHintToggle: vi.fn<Props["onHintToggle"]>(),
    onKeep: vi.fn<Props["onKeep"]>(),
  };
  const props = calendarProps({ ...handlers, ...overrides });
  renderInRouter(() => <PlayerCalendar {...props} />);
  return handlers;
}

function backendRefusal() {
  let reject: (error: Error) => void = () => {};
  const refusal = new Promise<never>((_resolve, rejectRefusal) => {
    reject = rejectRefusal;
  });
  return {
    refusal,
    refuse: () =>
      act(async () => {
        reject(new Error("OUT_OF_WINDOW"));
        await refusal.catch(() => undefined);
      }),
  };
}

function CalendarWithRefusingBackend({ refusal }: { refusal: Promise<never> }) {
  const [month, setMonth] = useState("2026-10");
  const [answers, setAnswers] = useState<Props["answers"]>({ "2026-10-04": "free" });
  return (
    <PlayerCalendar
      {...calendarProps({
        month,
        answers,
        onMonthChange: setMonth,
        onFillRest: () => {
          const before = answers;
          setAnswers(everyDayFrom(4, 31));
          return refusal.catch((error: unknown) => {
            setAnswers(before);
            throw error;
          });
        },
      })}
    />
  );
}

function CalendarWithBackend() {
  const [month, setMonth] = useState("2026-10");
  const [answers, setAnswers] = useState<Props["answers"]>({ "2026-10-04": "free" });
  return (
    <PlayerCalendar
      {...calendarProps({
        month,
        answers,
        onAnswer: (date, answer) => setAnswers(withAnswer(answers ?? {}, date, answer)),
        onFillRest: () => {
          setAnswers(everyDayFrom(4, 31));
          return Promise.resolve(null);
        },
        onMonthChange: (next) => {
          setMonth(next);
          setAnswers({});
        },
      })}
    />
  );
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
    expect(screen.getByRole("button", { name: "Next month" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
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

  it("hands focus to the done card after Fill Rest and to the month after Fill next", async () => {
    renderInRouter(() => <CalendarWithBackend />);

    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));
    expect(screen.getByText("All set for October ✓")).toBe(document.activeElement);
    expect(screen.getByRole("status").textContent).toContain("Your GM sees it already.");

    await userEvent.click(screen.getByRole("button", { name: "Fill November →" }));
    expect(screen.getByRole("heading", { level: 2, name: "November 2026" })).toBe(
      document.activeElement,
    );
  });

  it("gives focus back to Fill Rest when the backend refuses it", async () => {
    const { refusal, refuse } = backendRefusal();
    renderInRouter(() => <CalendarWithRefusingBackend refusal={refusal} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));

    await refuse();

    expect(await screen.findByRole("button", { name: /^Mark the other/ })).toBe(
      document.activeElement,
    );
  });

  it("leaves focus alone when a tap reopens a month that Fill Rest saved", async () => {
    renderInRouter(() => <CalendarWithBackend />);
    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));
    (document.activeElement as HTMLElement).blur();

    fireEvent.click(await tile("Saturday, October 31: Busy"));

    expect(await screen.findByRole("button", { name: "Mark the other 1 night busy" })).not.toBe(
      document.activeElement,
    );
  });

  it("keeps focus on the night the player moved to while a refused Fill Rest rolls back", async () => {
    const { refusal, refuse } = backendRefusal();
    renderInRouter(() => <CalendarWithRefusingBackend refusal={refusal} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));
    act(() => screen.getByRole("button", { name: "Monday, October 5: Busy" }).focus());

    await refuse();

    expect(await tile("Monday, October 5: Not set")).toBe(document.activeElement);
  });

  it("ignores a refusal for a month the player swiped away from", async () => {
    const { refusal, refuse } = backendRefusal();
    renderInRouter(() => <CalendarWithRefusingBackend refusal={refusal} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));
    (document.activeElement as HTMLElement).blur();
    swipe(
      screen.getByRole("group", { name: "October 2026" }),
      { x: 200, y: 100 },
      { x: 100, y: 100 },
    );
    await screen.findByRole("heading", { level: 2, name: "November 2026" });

    await refuse();

    expect(screen.getByRole("button", { name: /^Mark the other/ })).not.toBe(
      document.activeElement,
    );
  });

  it("explains that past nights lock under a read-only month", async () => {
    renderCalendar({ month: "2026-09" });

    expect(
      await screen.findByText("Past nights lock. Future months unlock two ahead."),
    ).toBeTruthy();
  });

  it("ties the first-visit hint to the tile it points at", async () => {
    renderCalendar({ hintVisible: true });

    const hint = await screen.findByRole("tooltip");
    expect((await tile(/October 4/)).getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("offers no How it works on a read-only month", async () => {
    renderCalendar({ month: "2026-09" });

    expect(await screen.findByText("Past · read only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "How it works" })).toBeNull();
  });

  it.each([
    ["a left swipe", { x: 200, y: 100 }, { x: 100, y: 110 }, "2026-11"],
    ["a right swipe", { x: 100, y: 100 }, { x: 200, y: 90 }, "2026-09"],
  ])("changes the month on %s", async (_case, from, to, month) => {
    const { onMonthChange } = renderCalendar();
    const grid = await screen.findByRole("group", { name: "October 2026" });

    swipe(grid, from, to);

    expect(onMonthChange).toHaveBeenCalledWith(month);
  });

  it.each([
    ["a mostly vertical drag", "2026-10", { x: 200, y: 100 }, { x: 140, y: 300 }],
    ["a left swipe past the Booking Window", "2026-12", { x: 200, y: 100 }, { x: 100, y: 100 }],
  ])("keeps the month on %s", async (_case, month, from, to) => {
    const { onMonthChange } = renderCalendar({ month });
    const grid = await screen.findByRole("group");

    swipe(grid, from, to);

    expect(onMonthChange).not.toHaveBeenCalled();
  });
});

function swipe(target: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.touchStart(target, { touches: [{ clientX: from.x, clientY: from.y }] });
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: to.x, clientY: to.y }] });
}

describe("PlayerCalendar keeping the Group", () => {
  it("offers nothing before the first answer", async () => {
    renderCalendar({ answers: {}, keepOffered: false });
    await screen.findByRole("heading", { name: "Thursday Crew" });

    expect(screen.queryByRole("button", { name: "Keep this group" })).toBeNull();
    expect(screen.queryByText(/Kept in My groups/)).toBeNull();
  });

  it("offers a quiet line under the calendar once the Player answered", async () => {
    const { onKeep } = renderCalendar({ answers: {}, keepOffered: true });

    const keep = await screen.findByRole("button", { name: "Keep this group" });
    expect(keep.closest("p")?.textContent).toBe("Keep this group on all your devices.");
    await userEvent.click(keep);

    expect(onKeep).toHaveBeenCalledOnce();
  });

  it("holds the line while keeping", async () => {
    renderCalendar({ keepOffered: true, keep: "keeping" });

    expect(await screen.findByRole("button", { name: "Keeping…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("reads Kept in My groups once the Account holds the Player", async () => {
    renderCalendar({ answers: {}, keep: "kept" });

    expect(await screen.findByText("Kept in My groups")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep this group" })).toBeNull();
  });

  it("moves focus to the kept line once the keep goes through", async () => {
    function KeepingCalendar() {
      const [keep, setKeep] = useState<Props["keep"]>("offer");
      return (
        <PlayerCalendar
          {...calendarProps({ keepOffered: true, keep, onKeep: () => setKeep("kept") })}
        />
      );
    }
    renderInRouter(() => <KeepingCalendar />);

    await userEvent.click(await screen.findByRole("button", { name: "Keep this group" }));

    expect(document.activeElement?.textContent).toBe("Kept in My groups");
  });

  it("explains a refused keep", async () => {
    renderCalendar({ keepOffered: true, keepRefusal: "Another account keeps this name." });

    expect((await screen.findByRole("alert")).textContent).toBe("Another account keeps this name.");
  });

  it("shows the account control in the header", async () => {
    renderCalendar({ accountControl: <button type="button">Log in</button> });

    expect(
      within(await screen.findByRole("banner")).getByRole("button", { name: "Log in" }),
    ).toBeTruthy();
  });
});
