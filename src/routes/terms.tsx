import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../features/legal/LegalPage";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: pageTitle("Terms of Use") }] }),
  component: () => <LegalPage page="terms" />,
});
