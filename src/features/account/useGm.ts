import { useAuthActions, useConvexAuth as useAuthSession } from "@convex-dev/auth/react";
import type { AuthTokenFetcher } from "convex/browser";
import {
  type ConvexReactClient,
  useConvex,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import { keepGroup, resumePendingKeep, type Keep, type KeepDeps } from "./keep";
import {
  finishPendingSave,
  PASSWORD_FLOWS,
  resumePendingSave,
  saveGroups,
  type ClaimDeps,
  type SaveInput,
} from "./save";

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

type LiveSession = {
  client: Pick<ConvexReactClient, "setAuth">;
  fetchAccessToken: AuthTokenFetcher;
  isAuthenticated: boolean;
};

let pendingSwitch: Promise<unknown> = Promise.resolve();

export function signInSwitchingIdentity(signIn: () => Promise<unknown>, session: LiveSession) {
  const next = pendingSwitch.catch(() => undefined).then(() => switchIdentity(signIn, session));
  pendingSwitch = next;
  return next;
}

async function switchIdentity(signIn: () => Promise<unknown>, session: LiveSession) {
  await signIn();
  if (session.isAuthenticated) await confirmIdentity(session);
}

function confirmIdentity({ client, fetchAccessToken }: LiveSession) {
  return new Promise<void>((resolve, reject) => {
    client.setAuth(fetchAccessToken, (isAuthenticated) => {
      if (isAuthenticated) resolve();
      else reject(new Error("The server refused the new sign-in"));
    });
  });
}

function useResumeLeftOvers(
  status: GmStatus,
  redeemClaim: ClaimDeps["finishSave"],
  claimPlayer: KeepDeps["claim"],
) {
  const resolved = useRef(false);
  useEffect(() => {
    if (resolved.current || status === "loading") return;
    resolved.current = true;
    if (status !== "account") return;
    void resumePendingSave({ finishSave: redeemClaim, storage: sessionStorage });
    void resumePendingKeep({ claim: claimPlayer, storage: sessionStorage });
  }, [status, redeemClaim, claimPlayer]);
}

export function useGm() {
  const auth = useConvexAuth();
  const me = useQuery(api.account.me);
  const { signIn: providerSignIn, signOut } = useAuthActions();
  const { fetchAccessToken, isAuthenticated } = useAuthSession();
  const client = useConvex();
  const signIn = useCallback(
    (...args: Parameters<typeof providerSignIn>) =>
      signInSwitchingIdentity(() => providerSignIn(...args), {
        client,
        fetchAccessToken,
        isAuthenticated,
      }),
    [providerSignIn, client, fetchAccessToken, isAuthenticated],
  );
  const startSave = useMutation(api.account.startSave);
  const redeemClaim = useMutation(api.account.finishSave);
  const claimPlayer = useMutation(api.player.claim);
  const status = gmStatus(auth, me);

  useResumeLeftOvers(status, redeemClaim, claimPlayer);

  const actions = useMemo(
    () => ({
      createLink: () => signIn("anonymous"),
      logIn: ({ email, password }: Omit<SaveInput, "mode">) =>
        signIn("password", { email, password, flow: "signIn" }),
      signInWithPassword: ({ email, password, mode }: SaveInput) =>
        signIn("password", { email, password, flow: PASSWORD_FLOWS[mode] }),
      keepGroup: (keep: Keep, signInFirst: () => Promise<unknown>) =>
        keepGroup(keep, signInFirst, { claim: claimPlayer, storage: sessionStorage }),
      save: (input: SaveInput) =>
        saveGroups(input, {
          startSave: () => startSave({}),
          signIn,
          finishSave: redeemClaim,
          storage: sessionStorage,
        }),
      finishSave: () => finishPendingSave({ finishSave: redeemClaim, storage: sessionStorage }),
      signOut,
    }),
    [signIn, signOut, startSave, redeemClaim, claimPlayer],
  );

  return { status, email: me?.email, ...actions };
}
