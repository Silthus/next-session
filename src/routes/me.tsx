import { createFileRoute } from "@tanstack/react-router";
import { MyGroupsScreen } from "../features/me/MyGroupsScreen";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/me")({
  head: () => ({ meta: [{ title: pageTitle("My groups") }] }),
  component: MyGroupsScreen,
});
