import { REMINDER_LINK_PARAM } from "../../shared/reminders";
import type { Doc } from "../_generated/dataModel";

declare const process: { env: Record<string, string | undefined> };

export function siteLink(path: string) {
  return new URL(path, process.env.SITE_URL).href;
}

export function shareLinkOf(group: Doc<"groups">) {
  return siteLink(`/s/${encodeURIComponent(group.shareToken)}`);
}

export function remindersOffLinkOf(reminderLinkToken: string) {
  return siteLink(`/reminders/off?${REMINDER_LINK_PARAM}=${encodeURIComponent(reminderLinkToken)}`);
}
