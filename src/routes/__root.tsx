import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NotFoundScreen } from "../ui/NotFoundScreen";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundScreen,
});
