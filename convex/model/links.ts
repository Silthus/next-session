import { REMINDER_LINK_PARAM } from "../../shared/reminders";
import type { Doc } from "../_generated/dataModel";

const APP_ORIGIN = "https://next-session.link";

export function shareLinkOf(group: Doc<"groups">) {
  return `${APP_ORIGIN}/s/${encodeURIComponent(group.shareToken)}`;
}

export function remindersOffLinkOf(reminderLinkToken: string) {
  return `${APP_ORIGIN}/reminders/off?${REMINDER_LINK_PARAM}=${encodeURIComponent(reminderLinkToken)}`;
}
