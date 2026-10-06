import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { pageTitle } from "../lib/pageTitle";
import { Button } from "../ui/Button";
import { NotFoundScreen } from "../ui/NotFoundScreen";
import { StatusScreen } from "../ui/StatusScreen";

export const Route = createRootRoute({
  head: ({ match }) => ({
    meta: [{ title: match._notFound ? pageTitle("Nothing here") : pageTitle() }],
  }),
  component: Root,
  notFoundComponent: () => <NotFoundScreen kind="page" />,
  errorComponent: BrokenPageScreen,
});

function Root() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}

function BrokenPageScreen() {
  return (
    <StatusScreen headline="Something broke" explanation="Reload the page.">
      <Button className="mt-2" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </StatusScreen>
  );
}
