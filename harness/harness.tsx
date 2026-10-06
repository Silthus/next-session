import { createMemoryHistory, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import { Route as rootRoute } from "../src/routes/__root";
import { NotFoundScreen } from "../src/ui/NotFoundScreen";

const screenName = new URLSearchParams(location.search).get("screen") ?? "page";
const broken = createRoute({ getParentRoute: () => rootRoute, path: "/broken", component: () => { throw new Error("boom"); } });
const link = createRoute({ getParentRoute: () => rootRoute, path: "/link", component: () => <NotFoundScreen kind="link" /> });
const router = createRouter({
  routeTree: rootRoute.addChildren([broken, link]),
  history: createMemoryHistory({ initialEntries: [`/${screenName === "page" ? "nope" : screenName}`] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
