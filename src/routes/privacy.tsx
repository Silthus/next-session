import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../features/legal/LegalPage";

export const Route = createFileRoute("/privacy")({
  component: () => <LegalPage page="privacy" />,
});
