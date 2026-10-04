import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BestNights } from "./BestNights";
import { monthWith, rosterOf } from "./railFixtures";

function renderBestNights(
  summary: ReturnType<typeof monthWith>,
  { playerCount = 5, monthOver = false } = {},
) {
  const onSelectDay = vi.fn();
  render(
    <BestNights
      nights={summary.bestNights}
      playerCount={playerCount}
      monthOver={monthOver}
      onSelectDay={onSelectDay}
    />,
  );
  return { onSelectDay, card: screen.getByRole("region", { name: "Best nights" }) };
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
    expect(screen.getByRole("button", { name: /Session scheduled/ })).toBeTruthy();
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
