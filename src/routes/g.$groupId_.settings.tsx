import { createFileRoute } from "@tanstack/react-router";
import { TimeAndPlaceScreen } from "../features/group/settings/TimeAndPlaceScreen";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/g/$groupId_/settings")({
  head: () => ({ meta: [{ title: pageTitle("Time and place") }] }),
  component: TimeAndPlaceRoute,
});

function TimeAndPlaceRoute() {
  const { groupId } = Route.useParams();
  return <TimeAndPlaceScreen groupId={groupId} />;
}
