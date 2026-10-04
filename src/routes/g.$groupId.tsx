import { createFileRoute, useRouter } from "@tanstack/react-router";
import { GroupError, GroupScreen, type GroupSearch } from "../features/group/GroupScreen";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/g/$groupId")({
  validateSearch: (search: Record<string, unknown>): GroupSearch => ({
    month: typeof search.month === "string" ? search.month : undefined,
    day: typeof search.day === "string" ? search.day : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitle("Your group") }] }),
  component: GroupRoute,
  errorComponent: GroupRouteError,
});

function GroupRoute() {
  const { groupId } = Route.useParams();
  return <GroupScreen groupId={groupId} search={Route.useSearch()} />;
}

function GroupRouteError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <GroupError
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}
