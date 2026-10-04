import { createFileRoute } from "@tanstack/react-router";
import { PlayerScreen } from "../features/player/PlayerScreen";

export const Route = createFileRoute("/s/$shareToken")({
  validateSearch: (search: Record<string, unknown>): { month?: string } =>
    typeof search.month === "string" ? { month: search.month } : {},
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
    />
  );
}
