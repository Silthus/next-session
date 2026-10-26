import { test } from "@e2e-dev/web";
import { expect, type Screen } from "e2e";
import {
  addMonths,
  monthDays,
  monthOf,
  todayUtc,
  type IsoDate,
  type IsoMonth,
} from "../../shared/dates";
import { asAnotherVisitor } from "./visitors";

const player = "Ana";
const thisMonth = monthOf(todayUtc(Date.now()));
const nextMonth = addMonths(thisMonth, 1);
const [firstNight, secondNight] = secondAndThirdFriday(nextMonth);

test("a GM shares one link, a player marks their nights, and the GM picks the next session", async ({
  app,
  agent,
  browser,
  screen,
}) => {
  await app.open("/");
  await agent.act("create a link for a new group");
  await expect(shareLinkIsReady(screen)).toBeVisible();
  await app.screenshot("the GM has a Share Link to send");

  await agent.act("open the group");
  await expect(calendarOf(screen, thisMonth)).toBeVisible();
  await app.screenshot("the GM sees their group");

  const shareLink = await screen.getByText(/\/s\//).textContent();

  await asAnotherVisitor({ app, browser }, async () => {
    await app.open(shareLink!.slice(shareLink!.indexOf("/s/")));
    await agent.act("join the group as {name}", { params: { name: player } });
    await expect(answeringAs(screen, player)).toBeVisible();
    await app.screenshot("the player joined the group");

    await agent.act("mark {first} and {second} as free", {
      params: { first: spokenDay(firstNight), second: spokenDay(secondNight) },
    });
    await expect(nightMarkedFree(screen, firstNight)).toBeVisible();
    await expect(nightMarkedFree(screen, secondNight)).toBeVisible();
    await app.screenshot("the player marked their free nights");
  });

  await agent.act("show {month}", { params: { month: spokenMonth(nextMonth) } });
  await expect(bestNight(screen, firstNight)).toBeVisible();
  await expect(bestNight(screen, secondNight)).toBeVisible();
  await app.screenshot("the GM sees the best nights");

  await agent.act("schedule {night} as the next session", {
    params: { night: spokenDay(firstNight) },
  });
  await browser.reload();
  await expect(scheduledSession(screen, firstNight)).toBeVisible();
  await app.screenshot("the GM picked the next session");
});

function shareLinkIsReady(screen: Screen) {
  return screen.getByText("Your link is ready. Send it to your players.");
}

function calendarOf(screen: Screen, month: IsoMonth) {
  return screen.getByRole("heading", `${spokenMonth(month)} ${month.slice(0, 4)}`);
}

function answeringAs(screen: Screen, name: string) {
  return screen.getByText(`Answering as ${name} · Not you?`);
}

function nightMarkedFree(screen: Screen, night: IsoDate) {
  return screen.getByRole("button", new RegExp(`^${spokenDay(night)}: Free`));
}

function bestNight(screen: Screen, night: IsoDate) {
  return screen
    .getByRole("region", "Best nights")
    .getByRole(
      "button",
      `Schedule ${format(night, { weekday: "long", month: "short", day: "numeric" })}`,
    );
}

function scheduledSession(screen: Screen, night: IsoDate) {
  return screen.getByRole("button", new RegExp(`^${spokenDay(night)}: .*Session scheduled`));
}

function secondAndThirdFriday(month: IsoMonth): [IsoDate, IsoDate] {
  const fridays = monthDays(month).filter(
    (date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 5,
  );
  return [fridays[1]!, fridays[2]!];
}

function spokenDay(date: IsoDate) {
  return format(date, { weekday: "long", month: "long", day: "numeric" });
}

function spokenMonth(month: IsoMonth) {
  return format(`${month}-01`, { month: "long" });
}

function format(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
