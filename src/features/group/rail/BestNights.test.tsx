import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BestNights } from "./BestNights";
import { monthWith, rosterOf } from "./railFixtures";

function renderBestNights(
  summary: ReturnType<typeof monthWith>,
  {
    playerCount = 5,
    monthOver = false,
    onSchedule,
  }: {
    playerCount?: number;
    monthOver?: boolean;
    onSchedule?: (date: string) => Promise<unknown>;
  } = {},
) {
  const onSelectDay = vi.fn();
  const bestNights = (nights: ReturnType<typeof monthWith>) => (
    <BestNights
      nights={nights.bestNights}
      playerCount={playerCount}
      monthOver={monthOver}
      onSelectDay={onSelectDay}
      onSchedule={onSchedule}
    />
  );
  const view = render(bestNights(summary));
  return {
    onSelectDay,
    card: screen.getByRole("region", { name: "Best nights" }),
    rerenderWith: (next: ReturnType<typeof monthWith>) => view.rerender(bestNights(next)),
  };
}

describe("BestNights", () => {
  it("ranks the nights and says who is free", () => {
    const { card } = renderBestNights(
      monthWith({
        answers: {
          "2026-10-16": { Ana: "free", Ben: "free", Chiara: "free", Dev: "maybe", Eli: "maybe" },
          "2026-10-09": { Ana: "free", Ben: "free", Chiara: "free", Dev: "free", Eli: "free" },
          "2026-10-10": { Ana: "free", Ben: "busy" },
        },
      }),
    );
    const rows = within(card).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^1Friday, Oct 9Everyone is free/),
      expect.stringMatching(/^2Friday, Oct 163 of 5 free, 2 maybe/),
    ]);
  });

  it.each([
    [
      { "2026-10-09": { Ana: "free", Ben: "free", Chiara: "free", Dev: "free", Eli: "free" } },
      "1 night works for everyone",
    ],
    [
      {
        "2026-10-09": { Ana: "free", Ben: "free", Chiara: "free", Dev: "free", Eli: "free" },
        "2026-10-16": { Ana: "free", Ben: "free", Chiara: "free", Dev: "free", Eli: "free" },
        "2026-10-23": { Ana: "free" },
      },
      "2 nights work for everyone",
    ],
    [{ "2026-10-09": { Ana: "free" }, "2026-10-16": { Ana: "free" } }, "2 nights work"],
    [{ "2026-10-09": { Ana: "free" } }, "1 night works"],
  ] as const)("says what matters now", (answers, status) => {
    const { card } = renderBestNights(monthWith({ answers }));
    expect(within(card).getByText(status)).toBeTruthy();
  });

  it("counts every night that works but lists the top three", () => {
    const everyone = {
      Ana: "free",
      Ben: "free",
      Chiara: "free",
      Dev: "free",
      Eli: "free",
    } as const;
    const { card } = renderBestNights(
      monthWith({
        answers: {
          "2026-10-09": everyone,
          "2026-10-16": everyone,
          "2026-10-23": everyone,
          "2026-10-30": everyone,
        },
      }),
    );
    expect(within(card).getByText("4 nights work for everyone")).toBeTruthy();
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
  });

  it("selects a night's day", async () => {
    const { onSelectDay } = renderBestNights(
      monthWith({ answers: { "2026-10-16": { Ana: "free" } } }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Friday, Oct 16/ }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-10-16");
  });

  it("shows at most four free players and counts the rest", () => {
    const players = rosterOf("Ana", "Ben", "Chiara", "Dev", "Eli", "Fay");
    renderBestNights(
      monthWith({
        players,
        answers: { "2026-10-16": Object.fromEntries(players.map(({ name }) => [name, "free"])) },
      }),
      { playerCount: 6 },
    );
    const night = screen.getByRole("button", {
      name: "Friday, Oct 16, Everyone is free. Free: Ana, Ben, Chiara, Dev, Eli, Fay",
    });
    expect(within(night).getByText("+2")).toBeTruthy();
    expect(night.textContent).toMatch(/ANBECHDE\+2$/);
  });

  it("names no one free on a night of maybes", () => {
    renderBestNights(monthWith({ answers: { "2026-10-16": { Ana: "maybe", Ben: "maybe" } } }));
    expect(
      screen.getByRole("button", { name: "Friday, Oct 16, 0 of 5 free, 2 maybe" }),
    ).toBeTruthy();
  });

  it("marks a night that already has a Session", () => {
    renderBestNights(
      monthWith({ answers: { "2026-10-16": { Ana: "free" } }, sessions: ["2026-10-16"] }),
    );
    const night = screen.getByRole("button", { name: /Session scheduled/ });
    expect(night.querySelector("[data-mark=session]")).not.toBeNull();
  });

  it("ranks a Cancelled night on its Answers, without the Session star", () => {
    const { card } = renderBestNights(
      monthWith({
        answers: { "2026-10-16": { Ana: "free" }, "2026-10-09": { Ana: "free", Ben: "free" } },
        cancelled: ["2026-10-09"],
      }),
    );
    const [first] = within(card).getAllByRole("listitem");
    const night = within(first!).getByRole("button", {
      name: "Friday, Oct 9, 2 of 5 free. Free: Ana, Ben. Session cancelled",
    });
    expect(night.querySelector("[data-mark=session]")).toBeNull();
  });

  describe("scheduling straight from the rail", () => {
    const nights = () =>
      monthWith({
        answers: { "2026-10-16": { Ana: "free" }, "2026-10-09": { Ana: "free", Ben: "free" } },
        sessions: ["2026-10-16"],
      });

    it("schedules a night without opening its day", async () => {
      let settle = () => undefined as void;
      const onSchedule = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
      const { onSelectDay } = renderBestNights(nights(), { onSchedule });
      const schedule = screen.getByRole("button", { name: "Schedule Friday, Oct 9" });
      await userEvent.click(schedule);
      expect(onSchedule).toHaveBeenCalledWith("2026-10-09");
      expect(onSelectDay).not.toHaveBeenCalled();
      const scheduling = screen.getByRole("button", { name: "Scheduling Friday, Oct 9" });
      expect(scheduling.getAttribute("aria-disabled")).toBe("true");
      await userEvent.click(scheduling);
      expect(onSchedule).toHaveBeenCalledOnce();
      settle();
      expect(await screen.findByRole("button", { name: "Schedule Friday, Oct 9" })).toBeTruthy();
    });

    it("keeps focus on the night once it is scheduled and the quick action goes", async () => {
      const onSchedule = vi.fn(() => Promise.resolve());
      const view = renderBestNights(nights(), { onSchedule });
      await userEvent.click(screen.getByRole("button", { name: "Schedule Friday, Oct 9" }));
      view.rerenderWith(
        monthWith({
          answers: { "2026-10-16": { Ana: "free" }, "2026-10-09": { Ana: "free", Ben: "free" } },
          sessions: ["2026-10-16", "2026-10-09"],
        }),
      );
      expect(screen.queryByRole("button", { name: "Schedule Friday, Oct 9" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Friday, Oct 9,/ }));
    });

    it("schedules a Cancelled night again", async () => {
      const onSchedule = vi.fn(() => Promise.resolve());
      renderBestNights(
        monthWith({ answers: { "2026-10-09": { Ana: "free" } }, cancelled: ["2026-10-09"] }),
        { onSchedule },
      );
      const again = screen.getByRole("button", { name: "Schedule again Friday, Oct 9" });
      expect(again.textContent).toBe("Schedule again");
      await userEvent.click(again);
      expect(onSchedule).toHaveBeenCalledWith("2026-10-09");
    });

    it("offers no quick action for a night that already has a Session", () => {
      renderBestNights(nights(), { onSchedule: vi.fn(() => Promise.resolve()) });
      expect(screen.queryByRole("button", { name: "Schedule Friday, Oct 16" })).toBeNull();
    });

    it("offers no quick action where the rail cannot schedule", () => {
      renderBestNights(nights());
      expect(screen.queryByRole("button", { name: /^Schedule / })).toBeNull();
    });
  });

  it.each([
    [{ playerCount: 0 }, "Once players answer, the best nights show up here."],
    [{ playerCount: 5 }, "No night works for everyone yet. Nudge the quiet ones."],
    [{ playerCount: 5, monthOver: true }, "This month is over. Pick a later one."],
  ])("explains an empty list for %o", (options, line) => {
    const { card } = renderBestNights(monthWith({ players: [] }), options);
    expect(within(card).getByText(line)).toBeTruthy();
    expect(within(card).queryByRole("list")).toBeNull();
  });
});
