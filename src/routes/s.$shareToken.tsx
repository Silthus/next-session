import { createFileRoute } from "@tanstack/react-router";
import { isValidMonth, type IsoMonth } from "../../shared/dates";
import { PlayerScreen } from "../features/player/PlayerScreen";

export const Route = createFileRoute("/s/$shareToken")({
  validateSearch: ({ month }: Record<string, unknown>): { month?: IsoMonth } => ({
    month: typeof month === "string" && isValidMonth(month) ? month : undefined,
  }),
  component: PlayerRoute,
});

function PlayerRoute() {
  const { shareToken } = Route.useParams();
  const { month } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PlayerScreen
      shareToken={shareToken}
      requestedMonth={month}
      onMonthChange={(next) => void navigate({ search: { month: next } })}
      onOwnGroup={(groupId) =>
        void navigate({
          to: "/g/$groupId",
          params: { groupId },
          search: { month: month && isValidMonth(month) ? month : undefined },
          replace: true,
        })
      }
    />
  );
}
