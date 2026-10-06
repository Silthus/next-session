import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TIPS_CONFIRM_PARAM } from "../../shared/tips";
import { TipsScreen } from "../features/tips/TipsScreen";

type TipsSearch = { [TIPS_CONFIRM_PARAM]?: string };

export const Route = createFileRoute("/tips")({
  validateSearch: (search: Record<string, unknown>): TipsSearch => {
    const code = search[TIPS_CONFIRM_PARAM];
    return typeof code === "string" ? { [TIPS_CONFIRM_PARAM]: code } : {};
  },
  component: TipsRoute,
});

function TipsRoute() {
  const code = Route.useSearch()[TIPS_CONFIRM_PARAM];
  const [codeFromMail] = useState(code);
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (code !== undefined) void navigate({ search: {}, replace: true });
  }, [code, navigate]);
  return <TipsScreen code={codeFromMail} />;
}
