import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../features/legal/LegalPage";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: pageTitle("Privacy Policy") }] }),
  component: () => <LegalPage page="privacy" />,
});
