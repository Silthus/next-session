import { monthOf, type IsoDate, type IsoMonth } from "../../../shared/dates";

export function shareLinkUrl({
  origin,
  shareToken,
  month,
  today,
}: {
  origin: string;
  shareToken: string;
  month: IsoMonth;
  today: IsoDate;
}): string {
  const url = new URL(`/s/${encodeURIComponent(shareToken)}`, origin);
  url.searchParams.set("month", answerableMonth(month, today));
  return url.href;
}

function answerableMonth(month: IsoMonth, today: IsoDate): IsoMonth {
  const currentMonth = monthOf(today);
  return month < currentMonth ? currentMonth : month;
}
