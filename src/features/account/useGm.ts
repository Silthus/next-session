import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { resumePendingSave, saveGroups, type SaveInput } from "./save";

export type GmStatus = "loading" | "signedOut" | "anonymous" | "account";

type Me = FunctionReturnType<typeof api.account.me>;

export function gmStatus(
  auth: { isLoading: boolean; isAuthenticated: boolean },
  me: Me | undefined,
): GmStatus {
  if (auth.isLoading) return "loading";
  if (!auth.isAuthenticated) return "signedOut";
  if (me === undefined) return "loading";
  if (me === null) return "signedOut";
  return me.isAnonymous ? "anonymous" : "account";
}

export function useGm() {
  const auth = useConvexAuth();
  const me = useQuery(api.account.me);
  const { signIn, signOut } = useAuthActions();
  const startSave = useMutation(api.account.startSave);
  const finishSave = useMutation(api.account.finishSave);
  const status = gmStatus(auth, me);

  useEffect(() => {
    if (status === "account") void resumePendingSave({ finishSave, storage: sessionStorage });
  }, [status, finishSave]);

  const actions = useMemo(
    () => ({
      createLink: () => signIn("anonymous"),
      logIn: ({ email, password }: Omit<SaveInput, "mode">) =>
        signIn("password", { email, password, flow: "signIn" }),
      save: (input: SaveInput) =>
        saveGroups(input, {
          startSave: () => startSave({}),
          signIn,
          finishSave,
          storage: sessionStorage,
        }),
      signOut,
    }),
    [signIn, signOut, startSave, finishSave],
  );

  return { status, email: me?.email, ...actions };
}
