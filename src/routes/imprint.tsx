import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../features/legal/LegalPage";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/imprint")({
  head: () => ({ meta: [{ title: pageTitle("Imprint") }] }),
  component: () => <LegalPage page="imprint" />,
});
