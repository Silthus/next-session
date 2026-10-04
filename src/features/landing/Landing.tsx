import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AccountSheet, type AccountIntent } from "../account/AccountSheet";
import type { SaveInput } from "../account/save";
import { useGm } from "../account/useGm";
import { lastGroupId, returningGroupId } from "../group/rail/railStorage";
import { LandingView, type LandingState } from "./LandingView";

type Phase = "idle" | "creating" | "created" | "failed";

type CreatedGroup = { id: string; name: string; shareToken: string };

export function Landing() {
  const gm = useGm();
  const navigate = useNavigate();
  const signedIn = gm.status === "anonymous" || gm.status === "account";
  const groups = useQuery(api.groups.mine, signedIn ? {} : "skip");
  const createGroup = useMutation(api.groups.create);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<unknown>(null);
  const [createdGroupId, setCreatedGroupId] = useState<Id<"groups"> | null>(null);
  const [created, setCreated] = useState<CreatedGroup | null>(null);
  const [savedAs, setSavedAs] = useState<string | undefined>();
  const [loggedInAs, setLoggedInAs] = useState<string | undefined>();
  const [sheet, setSheet] = useState<AccountIntent | null>(null);

  const newGroupId = createdGroupId ?? (phase === "created" ? groups?.[0]?.id : undefined);
  const newGroup = useQuery(
    api.groups.get,
    newGroupId && !created ? { groupId: newGroupId } : "skip",
  );
  if (newGroup && !created) setCreated(newGroup);

  const returningTo =
    phase === "idle" || phase === "failed" ? returningGroupId(groups, lastGroupId()) : undefined;

  useEffect(() => {
    if (returningTo)
      void navigate({ to: "/g/$groupId", params: { groupId: returningTo }, replace: true });
  }, [returningTo, navigate]);

  const create = async () => {
    setPhase("creating");
    try {
      if (signedIn) setCreatedGroupId(await createGroup({}));
      else await gm.createLink();
      if (gm.status === "account") setSavedAs(gm.email);
      setPhase("created");
    } catch (error) {
      setFailure(error);
      setPhase("failed");
    }
  };

  const save = async (input: SaveInput) => {
    await gm.save(input);
    setSavedAs(input.email);
  };

  const finish = async () => {
    await gm.finishSave();
    setSavedAs(gm.email);
  };

  const logIn = async (input: Omit<SaveInput, "mode">) => {
    await gm.logIn(input);
    setLoggedInAs(input.email);
  };

  const sheetClosed = sheet === null;
  const accountWithoutGroups = gm.status === "account" && groups?.length === 0;
  const resolving = gm.status === "loading" || (signedIn && groups === undefined);
  if ((phase === "idle" && resolving) || returningTo) {
    return <div className="min-h-dvh" />;
  }

  return (
    <>
      <LandingView
        state={landingState(phase, failure, created, sheetClosed ? savedAs : undefined)}
        showLogIn={gm.status === "signedOut" && (phase === "idle" || phase === "failed")}
        loggedInAs={sheetClosed && accountWithoutGroups ? loggedInAs : undefined}
        onCreate={() => void create()}
        onLogIn={() => setSheet("logIn")}
        onSave={() => setSheet("save")}
      />
      {sheet === "save" && created ? (
        <AccountSheet
          open
          intent="save"
          groupName={created.name}
          signedInAs={gm.status === "account" ? gm.email : undefined}
          onSubmit={save}
          onFinish={finish}
          onClose={() => setSheet(null)}
        />
      ) : (
        <AccountSheet
          open={sheet === "logIn"}
          intent="logIn"
          onSubmit={logIn}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function landingState(
  phase: Phase,
  failure: unknown,
  created: CreatedGroup | null,
  savedAs: string | undefined,
): LandingState {
  if (phase === "failed") return { phase, error: failure };
  if (phase !== "created") return { phase };
  if (!created) return { phase: "creating" };
  return { phase, groupId: created.id, shareUrl: shareUrl(created.shareToken), savedAs };
}

function shareUrl(shareToken: string) {
  return `${window.location.origin}/s/${shareToken}`;
}
