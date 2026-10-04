import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { pageTitle } from "../lib/pageTitle";
import { NotFoundScreen } from "../ui/NotFoundScreen";

export const Route = createRootRoute({
  head: ({ match }) => ({
    meta: [{ title: match._notFound ? pageTitle("Nothing here") : pageTitle() }],
  }),
  component: Root,
  notFoundComponent: () => <NotFoundScreen kind="page" />,
});

function Root() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}
