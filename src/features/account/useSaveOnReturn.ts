import { useEffect, useState } from "react";
import { hasPendingSave, resumePendingSave, type ClaimDeps } from "./save";
import type { GmStatus } from "./useGm";

type Resume = "unresolved" | "resuming" | "saved" | "settled";

export function useSaveOnReturn(status: GmStatus, deps: ClaimDeps) {
  const [resume, setResume] = useState<Resume>("unresolved");
  if (resume === "unresolved" && status !== "loading") {
    setResume(status === "account" && hasPendingSave(deps.storage) ? "resuming" : "settled");
  }

  useEffect(() => {
    if (resume !== "resuming") return;
    void resumePendingSave(deps).then((saved) => setResume(saved ? "saved" : "settled"));
  }, [resume, deps]);

  return { resumingSave: resume === "resuming", savedOnReturn: resume === "saved" };
}
