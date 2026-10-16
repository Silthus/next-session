import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { REMINDER_LINK_PARAM } from "../../shared/reminders";
import { RemindersOffScreen } from "../features/reminders/RemindersOffScreen";

type RemindersOffSearch = { [REMINDER_LINK_PARAM]?: string };

export const Route = createFileRoute("/reminders/off")({
  validateSearch: (search: Record<string, unknown>): RemindersOffSearch => {
    const token = search[REMINDER_LINK_PARAM];
    return typeof token === "string" ? { [REMINDER_LINK_PARAM]: token } : {};
  },
  component: RemindersOffRoute,
});

function RemindersOffRoute() {
  const token = Route.useSearch()[REMINDER_LINK_PARAM];
  const [tokenFromMail] = useState(token);
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (token !== undefined) void navigate({ search: {}, replace: true });
  }, [token, navigate]);
  return <RemindersOffScreen token={tokenFromMail} />;
}
