import { useCallback, useEffect, useState } from "react";
import { finishPendingSave, hasPendingSave, type ClaimDeps } from "./save";
import type { GmStatus } from "./useGm";

type Resume = "unresolved" | "resuming" | "saved" | "refused" | "settled";

export function useSaveOnReturn(status: GmStatus, deps: ClaimDeps) {
  const [resume, setResume] = useState<Resume>("unresolved");
  const [refusal, setRefusal] = useState<unknown>();
  if (resume === "unresolved" && status !== "loading") {
    setResume(status === "account" && hasPendingSave(deps.storage) ? "resuming" : "settled");
  }

  useEffect(() => {
    if (resume !== "resuming") return;
    finishPendingSave(deps).then(
      () => setResume("saved"),
      (error: unknown) => {
        setRefusal(error);
        setResume("refused");
      },
    );
  }, [resume, deps]);

  const acknowledgeReturn = useCallback(() => setResume("settled"), []);

  return {
    resumingSave: resume === "resuming",
    savedOnReturn: resume === "saved",
    refusalOnReturn: resume === "refused" ? refusal : undefined,
    acknowledgeReturn,
  };
}
