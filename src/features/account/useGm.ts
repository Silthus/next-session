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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  forgetPendingKeep,
  keepAfterRedirect,
  keepGroup,
  resumePendingKeep,
  type Keep,
  type KeepDeps,
  type ResumedKeep,
} from "./keep";
import {
  finishLeftOverSave,
  finishPendingSave,
  PASSWORD_FLOWS,
  saveGroups,
  saveThroughGoogle,
  type SaveInput,
} from "./save";
import { useSaveOnReturn } from "./useSaveOnReturn";

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

const AUTH_CONFIRM_TIMEOUT_MS = 15_000;

export function authGate(initiallyAuthenticated: boolean) {
  let authenticated = initiallyAuthenticated;
  const waiting = new Set<() => void>();
  return {
    update(isAuthenticated: boolean) {
      authenticated = isAuthenticated;
      if (!isAuthenticated) return;
      for (const letThrough of waiting) letThrough();
      waiting.clear();
    },
    whenAuthenticated() {
      if (authenticated) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(letThrough);
          reject(new Error("The server did not confirm the sign-in"));
        }, AUTH_CONFIRM_TIMEOUT_MS);
        const letThrough = () => {
          clearTimeout(timer);
          resolve();
        };
        waiting.add(letThrough);
      });
    },
  };
}

function useAuthGate(isAuthenticated: boolean) {
  const [gate] = useState(() => authGate(isAuthenticated));
  useEffect(() => gate.update(isAuthenticated), [gate, isAuthenticated]);
  return gate;
}

function useKeepOnReturn(status: GmStatus, claimPlayer: KeepDeps["claim"]) {
  const resolved = useRef(false);
  const [keepOnReturn, setKeepOnReturn] = useState<ResumedKeep | null>(null);
  useEffect(() => {
    if (resolved.current || status === "loading") return;
    resolved.current = true;
    if (status !== "account") return;
    void resumePendingKeep({ claim: claimPlayer, storage: sessionStorage }).then(setKeepOnReturn);
  }, [status, claimPlayer]);
  return keepOnReturn;
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
  const save = useCallback(
    (input: SaveInput) =>
      saveGroups(input, {
        startSave: () => startSave({}),
        signIn,
        finishSave: redeemClaim,
        storage: sessionStorage,
      }),
    [signIn, startSave, redeemClaim],
  );
  const claimPlayer = useMutation(api.player.claim);
  const status = gmStatus(auth, me);
  const claims = useMemo(
    () => ({ finishSave: redeemClaim, storage: sessionStorage }),
    [redeemClaim],
  );
  const saveOnReturn = useSaveOnReturn(status, claims);
  const google = useQuery(api.signInOptions.available)?.google === true;
  const gate = useAuthGate(auth.isAuthenticated);

  const keepOnReturn = useKeepOnReturn(status, claimPlayer);

  const actions = useMemo(
    () => ({
      createLink: () => signIn("anonymous"),
      logIn: ({ email, password }: Omit<SaveInput, "mode">) =>
        signIn("password", { email, password, flow: "signIn" }),
      save,
      finishSave: () => finishPendingSave(claims),
      signOut,
    }),
    [signIn, signOut, save, claims],
  );

  const keepActions = useMemo(() => {
    const keepAfter = (keep: Keep, signInFirst: () => Promise<unknown>) =>
      keepGroup(
        keep,
        async () => {
          await signInFirst();
          await gate.whenAuthenticated();
        },
        { claim: claimPlayer, storage: sessionStorage },
      );
    const finishLeftOver = () => finishLeftOverSave(claims);
    const signInFor = (input: SaveInput) => {
      if (status === "account") return finishLeftOver();
      if (status === "anonymous") return save(input);
      return signIn("password", {
        email: input.email,
        password: input.password,
        flow: PASSWORD_FLOWS[input.mode],
      });
    };
    return {
      keepNow: (keep: Keep) => keepAfter(keep, finishLeftOver),
      keepWithPassword: (keep: Keep, input: SaveInput) => keepAfter(keep, () => signInFor(input)),
      forgetPendingKeep: () => forgetPendingKeep(sessionStorage),
    };
  }, [status, save, signIn, claims, claimPlayer, gate]);

  const googleActions = useMemo(() => {
    if (!google) {
      return { logInWithGoogle: undefined, saveWithGoogle: undefined, keepWithGoogle: undefined };
    }
    const leaveForGoogle = (redirectTo: string) => providerSignIn("google", { redirectTo });
    const saveWithGoogleBackTo = (redirectTo: string) =>
      saveThroughGoogle({
        startSave: () => startSave({}),
        storage: sessionStorage,
        continueWithGoogle: () => leaveForGoogle(redirectTo),
      });
    return {
      logInWithGoogle: (returnTo = "/") => leaveForGoogle(returnTo),
      saveWithGoogle: (groupId: string) => saveWithGoogleBackTo(`/g/${groupId}`),
      keepWithGoogle: (keep: Keep) => {
        const playerPage = `/s/${keep.shareToken}`;
        return keepAfterRedirect(
          keep,
          () =>
            status === "anonymous" ? saveWithGoogleBackTo(playerPage) : leaveForGoogle(playerPage),
          sessionStorage,
        );
      },
    };
  }, [google, providerSignIn, startSave, status]);

  return {
    status,
    email: me?.email,
    ...saveOnReturn,
    keepOnReturn,
    ...actions,
    ...keepActions,
    ...googleActions,
  };
}
