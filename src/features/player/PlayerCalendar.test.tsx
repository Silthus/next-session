import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "../../../shared/answers";
import { track } from "../../lib/telemetry";
import { PlayerCalendar } from "./PlayerCalendar";
import type { PlayerSession } from "./playerMonth";

const viewer = vi.hoisted(() => ({ timeZone: "Europe/Berlin" }));

vi.mock(import("../../lib/telemetry"), async (original) => ({
  ...(await original()),
  track: vi.fn(),
}));
vi.mock("../../lib/timeZone", () => ({ browserTimeZone: () => viewer.timeZone }));

beforeEach(() => {
  vi.mocked(track).mockReset();
  viewer.timeZone = "Europe/Berlin";
});

type Props = ComponentProps<typeof PlayerCalendar>;

const today = "2026-10-04";

function sessionOn(
  date: string,
  state: PlayerSession["state"] = "scheduled",
  details: Partial<PlayerSession> = {},
): PlayerSession {
  return { date, state, startTime: "19:00", lengthMinutes: 240, ...details };
}

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
    groupId: "group-thursday",
    groupName: "Thursday Crew",
    shareToken: "test-share-token",
    keptInMyGroups: false,
    playerName: "Ana",
    month: "2026-10",
    today,
    answers: {},
    sessions: [],
    timeZone: "Europe/Berlin",
    hintVisible: false,
    onAnswer: vi.fn(() => Promise.resolve(null)),
    onFillRest: vi.fn(() => Promise.resolve(null)),
    onMonthChange: vi.fn(),
    onNotYou: vi.fn(),
    onHintToggle: vi.fn(),
    ...props,
  };
}

function renderCalendar(overrides: Partial<Props> = {}) {
  const handlers = {
    onAnswer: vi.fn<Props["onAnswer"]>(() => Promise.resolve(null)),
    onFillRest: vi.fn<Props["onFillRest"]>(() => Promise.resolve(null)),
    onMonthChange: vi.fn<Props["onMonthChange"]>(),
    onNotYou: vi.fn<Props["onNotYou"]>(),
    onHintToggle: vi.fn<Props["onHintToggle"]>(),
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
        onAnswer: (date, answer) => {
          setAnswers(withAnswer(answers ?? {}, date, answer));
          return Promise.resolve(null);
        },
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
    renderCalendar({ sessions: [sessionOn("2026-10-16")] });

    const session = await tile("Friday, October 16: Not set, Session");
    expect(session).toHaveProperty("disabled", false);
    expect(session.textContent).toContain("★");
  });

  it("marks a Cancelled Session as Cancelled and keeps it answerable", async () => {
    const { onAnswer } = renderCalendar({
      answers: { "2026-10-16": "free" },
      sessions: [sessionOn("2026-10-16", "cancelled")],
    });

    const cancelled = await tile("Friday, October 16: Free, Session cancelled");
    expect(cancelled.textContent).toContain("Cancelled");
    expect(cancelled.textContent).not.toContain("★");
    await userEvent.click(cancelled);

    expect(onAnswer.mock.calls).toEqual([["2026-10-16", "maybe"]]);
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

function Visitor({
  startMonth = "2026-10",
  startAnswers = { "2026-10-04": "free" },
  refusal = null,
  onKeep = () => undefined,
  onContinueWithGoogle,
  onDismiss = () => undefined,
}: {
  startMonth?: string;
  startAnswers?: Props["answers"];
  refusal?: string | null;
  onKeep?: () => void;
  onContinueWithGoogle?: () => void;
  onDismiss?: () => void;
}) {
  const [month, setMonth] = useState(startMonth);
  const [answers, setAnswers] = useState(startAnswers);
  const [dismissed, setDismissed] = useState(false);
  return (
    <PlayerCalendar
      {...calendarProps({
        month,
        answers,
        onFillRest: () => {
          setAnswers(everyDayFrom(4, 31));
          return Promise.resolve(null);
        },
        onMonthChange: (next) => {
          setMonth(next);
          setAnswers({});
        },
        keepGroup: <p>Keep card</p>,
        keepSessions: dismissed
          ? undefined
          : {
              refusal,
              onKeep,
              onContinueWithGoogle,
              onDismiss: () => {
                setDismissed(true);
                onDismiss();
              },
            },
      })}
    />
  );
}

const keepSessionsTitle = "Keep your sessions and get a calendar invite";

describe("PlayerCalendar asks a visitor who finishes the month to keep their sessions", () => {
  it("turns the done card into the Keep your sessions card, confirmation first and focused", async () => {
    renderInRouter(() => <Visitor onContinueWithGoogle={() => undefined} />);
    expect(await screen.findByText("Keep card")).toBeTruthy();

    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));

    const card = screen.getByRole("status", { name: keepSessionsTitle });
    const confirmation = within(card).getByText("All set for October. Your GM sees it.");
    expect(confirmation).toBe(document.activeElement);
    expect(confirmation).toBe(card.firstElementChild);
    expect(within(card).getByRole("heading", { name: keepSessionsTitle })).toBeTruthy();
    expect(within(card).getByText("Every session lands in your calendar.")).toBeTruthy();
    expect(
      within(card)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Create account", "Continue with Google", "Not now, fill November →"]);
    expect(within(card).getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.queryByText("All set for October ✓")).toBeNull();
    expect(screen.queryByText("Keep card")).toBeNull();
  });

  it("starts the same keep from Create account and Continue with Google", async () => {
    const onKeep = vi.fn();
    const onContinueWithGoogle = vi.fn();
    renderInRouter(() => (
      <Visitor
        startAnswers={everyDayFrom(4, 31)}
        onKeep={onKeep}
        onContinueWithGoogle={onContinueWithGoogle}
      />
    ));
    const card = await screen.findByRole("status", { name: keepSessionsTitle });

    await userEvent.click(within(card).getByRole("button", { name: "Create account" }));
    await userEvent.click(within(card).getByRole("button", { name: "Continue with Google" }));

    expect(onKeep).toHaveBeenCalledOnce();
    expect(onContinueWithGoogle).toHaveBeenCalledOnce();
    expect(vi.mocked(track).mock.calls).toEqual([
      [{ name: "keep_group_started", group_id: "group-thursday", surface: "done_card" }],
      [{ name: "keep_group_started", group_id: "group-thursday", surface: "done_card" }],
    ]);
  });

  it("leaves Google and its legal line out until Google is switched on", async () => {
    renderInRouter(() => <Visitor startAnswers={everyDayFrom(4, 31)} />);
    const card = await screen.findByRole("status", { name: keepSessionsTitle });

    expect(within(card).queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(within(card).queryByRole("link", { name: "Terms" })).toBeNull();
  });

  it("explains a refused keep on the card", async () => {
    renderInRouter(() => (
      <Visitor startAnswers={everyDayFrom(4, 31)} refusal="Another account keeps this name." />
    ));
    const card = await screen.findByRole("status", { name: keepSessionsTitle });

    expect(within(card).getByRole("alert").textContent).toBe("Another account keeps this name.");
  });

  it("dismisses on Not now and lands on the next month in one tap", async () => {
    const onDismiss = vi.fn();
    renderInRouter(() => <Visitor startAnswers={everyDayFrom(4, 31)} onDismiss={onDismiss} />);

    await userEvent.click(await screen.findByRole("button", { name: "Not now, fill November →" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { level: 2, name: "November 2026" })).toBe(
      document.activeElement,
    );
    expect(screen.getByText("Keep card")).toBeTruthy();
  });

  it("only dismisses on the last bookable month, and the green card takes focus", async () => {
    const onDismiss = vi.fn();
    renderInRouter(() => (
      <Visitor
        startMonth="2026-12"
        startAnswers={everyDayFrom(1, 31, "2026-12")}
        onDismiss={onDismiss}
      />
    ));
    const card = await screen.findByRole("status", { name: keepSessionsTitle });
    expect(within(card).getByText("All set for now. Your GM sees it.")).toBeTruthy();

    await userEvent.click(within(card).getByRole("button", { name: "Not now" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { level: 2, name: "December 2026" })).toBeTruthy();
    expect(screen.getByText("All set for now ✓")).toBe(document.activeElement);
  });

  it("shows the green card on a finished month once the visitor said Not now", async () => {
    const { onMonthChange } = renderCalendar({ answers: everyDayFrom(4, 31) });

    expect(await screen.findByText("All set for October ✓")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: keepSessionsTitle })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Fill November →" }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-11");
  });
});

describe("PlayerCalendar next sessions", () => {
  const nextSessions = () => screen.findByRole("region", { name: "Next sessions" });

  it("shows when and where each upcoming Session is, soonest first", async () => {
    renderCalendar({
      sessions: [
        sessionOn("2026-10-22", "scheduled", { startTime: "20:00", lengthMinutes: 180 }),
        sessionOn("2026-10-16", "scheduled", {
          startTime: "18:30",
          lengthMinutes: 180,
          location: "Max's place",
        }),
      ],
    });

    const rows = within(await nextSessions()).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Friday, October 16in 12 days · 18:30–21:30Max's place",
      "Thursday, October 22in 18 days · 20:00–23:00",
    ]);
  });

  it("leaves out played and Cancelled Sessions", async () => {
    renderCalendar({
      sessions: [
        sessionOn("2026-10-01"),
        sessionOn("2026-10-04"),
        sessionOn("2026-10-09", "cancelled"),
      ],
    });

    const rows = within(await nextSessions()).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Sunday, October 4today · 19:00–23:00"]);
  });

  it("names the Group's zone when the player's browser is elsewhere", async () => {
    viewer.timeZone = "America/New_York";
    renderCalendar({ sessions: [sessionOn("2026-10-16")] });

    expect(within(await nextSessions()).getByRole("listitem").textContent).toBe(
      "Friday, October 16in 12 days · 19:00–23:00 Berlin time",
    );
  });

  it("offers the upcoming Sessions as a one-time copy for the player's calendar", async () => {
    renderCalendar({ sessions: [sessionOn("2026-10-16")] });

    const card = within(await nextSessions());
    expect(card.getByRole("link", { name: "Add to calendar" }).getAttribute("href")).toBe(
      "/cal/s/test-share-token.ics",
    );
    expect(
      card.getByText("A one-time copy. Keep this group to get moves and cancellations too."),
    ).toBeTruthy();
  });

  it("points an Account that keeps the Group to My groups to follow moves", async () => {
    renderCalendar({ sessions: [sessionOn("2026-10-16")], keptInMyGroups: true });

    const card = within(await nextSessions());
    expect(card.getByRole("link", { name: "Add to calendar" })).toBeTruthy();
    expect(card.getByRole("link", { name: "Subscribe on My groups" }).getAttribute("href")).toBe(
      "/me",
    );
    expect(card.getByText(/^A one-time copy\./).textContent).toBe(
      "A one-time copy. Subscribe on My groups to follow moves and cancellations.",
    );
    expect(card.queryByText(/Keep this group/)).toBeNull();
  });

  it("shows no Next sessions while nothing is scheduled ahead", async () => {
    renderCalendar({ sessions: [sessionOn("2026-10-02"), sessionOn("2026-10-20", "cancelled")] });

    await screen.findByRole("group", { name: "October 2026" });
    expect(screen.queryByRole("region", { name: "Next sessions" })).toBeNull();
  });
});

describe("PlayerCalendar header and keep slot", () => {
  it("shows the account control in the header", async () => {
    renderCalendar({ accountControl: <button type="button">Log in</button> });

    expect(
      within(await screen.findByRole("banner")).getByRole("button", { name: "Log in" }),
    ).toBeTruthy();
  });

  it("shows the keep slot under the calendar", async () => {
    renderCalendar({ keepGroup: <p>Kept in My groups</p> });

    expect(within(await screen.findByRole("main")).getByText("Kept in My groups")).toBeTruthy();
  });
});

describe("PlayerCalendar telemetry", () => {
  function deferred() {
    let settle: { resolve: () => void; reject: () => void } = {
      resolve: () => undefined,
      reject: () => undefined,
    };
    const promise = new Promise<null>((resolve, reject) => {
      settle = { resolve: () => resolve(null), reject: () => reject(new Error("offline")) };
    });
    return { promise, ...settle };
  }

  it("tracks calendar_downloaded when the player presses Add to calendar", async () => {
    renderCalendar({ groupId: "group-download", sessions: [sessionOn("2026-10-16")] });
    const download = await screen.findByRole("link", { name: "Add to calendar" });
    download.addEventListener("click", (event) => event.preventDefault());

    await userEvent.click(download);

    expect(track).toHaveBeenCalledExactlyOnceWith({
      name: "calendar_downloaded",
      group_id: "group-download",
    });
  });

  it("tracks answers_started at the first saved tap, once per page load", async () => {
    const saves = [deferred(), deferred(), deferred()];
    const onAnswer = vi.fn(() => saves[onAnswer.mock.calls.length - 1]!.promise);
    renderCalendar({ groupId: "group-first-tap", onAnswer });

    await userEvent.click(await tile(/^Sunday, October 4/));
    saves[0]!.reject();
    await userEvent.click(await tile(/^Monday, October 5/));
    expect(track).not.toHaveBeenCalled();

    saves[1]!.resolve();
    await vi.waitFor(() =>
      expect(track).toHaveBeenCalledExactlyOnceWith({
        name: "answers_started",
        group_id: "group-first-tap",
      }),
    );

    await userEvent.click(await tile(/^Tuesday, October 6/));
    saves[2]!.resolve();
    await act(() => Promise.resolve());
    expect(track).toHaveBeenCalledOnce();
  });

  it("does not track answers_started again when the calendar mounts again", async () => {
    renderCalendar({ groupId: "group-remount" });
    await userEvent.click(await tile(/^Sunday, October 4/));
    await vi.waitFor(() => expect(track).toHaveBeenCalledOnce());
    vi.mocked(track).mockReset();
    document.body.innerHTML = "";

    renderCalendar({ groupId: "group-remount" });
    await userEvent.click(await tile(/^Monday, October 5/));
    await act(() => Promise.resolve());

    expect(track).not.toHaveBeenCalled();
  });

  it("tracks fill_rest_used once the nights are saved, and not when refused", async () => {
    const refused = deferred();
    const onFillRest = vi.fn<Props["onFillRest"]>(() => refused.promise);
    renderCalendar({
      groupId: "group-fill-rest",
      answers: { "2026-10-04": "free" },
      onFillRest,
    });
    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));
    refused.reject();
    await act(() => Promise.resolve());
    expect(track).not.toHaveBeenCalledWith(expect.objectContaining({ name: "fill_rest_used" }));

    onFillRest.mockImplementation(() => Promise.resolve(null));
    await userEvent.click(await screen.findByRole("button", { name: /^Mark the other/ }));

    await vi.waitFor(() =>
      expect(track).toHaveBeenCalledWith({ name: "fill_rest_used", group_id: "group-fill-rest" }),
    );
    expect(track).toHaveBeenCalledWith({ name: "answers_started", group_id: "group-fill-rest" });
  });
});
