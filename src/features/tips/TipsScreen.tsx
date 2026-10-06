import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ConfirmTips } from "./ConfirmTips";

export function TipsScreen({ code }: { code: string | undefined }) {
  const confirmTips = useMutation(api.account.confirmTips);
  return <ConfirmTips code={code} confirm={(code) => confirmTips({ code })} />;
}
