import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TipsScreen } from "../features/tips/TipsScreen";
import { pageTitle } from "../lib/pageTitle";

export const Route = createFileRoute("/tips")({
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search.code === "string" ? { code: search.code } : {},
  head: () => ({ meta: [{ title: pageTitle("Tips") }] }),
  component: TipsRoute,
});

function TipsRoute() {
  const { code } = Route.useSearch();
  const [codeFromMail] = useState(code);
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (code !== undefined) void navigate({ search: {}, replace: true });
  }, [code, navigate]);
  return <TipsScreen code={codeFromMail} />;
}
