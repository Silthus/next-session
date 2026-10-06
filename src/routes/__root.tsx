import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { pageTitle } from "../lib/pageTitle";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { NotFoundScreen } from "../ui/NotFoundScreen";
import { PageShell } from "../ui/PageShell";
import { useFocusOnMount } from "../ui/useFocusOnMount";

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
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center justify-center gap-5 text-center"
    >
      <title>{pageTitle("Something broke")}</title>
      <Logo muted className="size-14" />
      <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-extrabold outline-none">
        Something broke
      </h1>
      <p className="text-ink-2">Reload the page.</p>
      <Button className="mt-2" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </PageShell>
  );
}
