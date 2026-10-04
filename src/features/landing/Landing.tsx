import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AccountSheet, type AccountIntent } from "../account/AccountSheet";
import { useGm } from "../account/useGm";
import { LandingView, type LandingState } from "./LandingView";

const LAST_GROUP_KEY = "next-session.lastGroup";

type Phase = "idle" | "creating" | "created" | "failed";

export function Landing() {
  const gm = useGm();
  const router = useRouter();
  const signedIn = gm.status === "anonymous" || gm.status === "account";
  const groups = useQuery(api.groups.mine, signedIn ? {} : "skip");
  const createGroup = useMutation(api.groups.create);
  const [phase, setPhase] = useState<Phase>("idle");
  const [createdGroupId, setCreatedGroupId] = useState<Id<"groups"> | null>(null);
  const [sheet, setSheet] = useState<AccountIntent | null>(null);

  const groupId = createdGroupId ?? (phase === "created" ? groups?.[0]?.id : undefined);
  const group = useQuery(api.groups.get, groupId ? { groupId } : "skip");
  const returningTo = phase === "idle" || phase === "failed" ? returningGroup(groups) : null;

  useEffect(() => {
    if (returningTo) router.history.replace(groupPath(returningTo));
  }, [returningTo, router]);

  const openGroup = (id: string) => router.history.push(groupPath(id));

  const create = async () => {
    setPhase("creating");
    try {
      if (signedIn) setCreatedGroupId(await createGroup({}));
      else await gm.createLink();
      setPhase("created");
    } catch {
      setPhase("failed");
    }
  };

  const resolving = gm.status === "loading" || (signedIn && groups === undefined);
  if ((phase === "idle" && resolving) || returningTo) {
    return <div className="min-h-dvh" />;
  }

  return (
    <>
      <LandingView
        state={landingState(phase, group, gm.status === "account" ? gm.email : undefined)}
        showLogIn={!signedIn}
        onCreate={() => void create()}
        onLogIn={() => setSheet("logIn")}
        onSave={() => setSheet("save")}
        onOpenGroup={openGroup}
      />
      {sheet === "save" && group ? (
        <AccountSheet
          open
          intent="save"
          groupName={group.name}
          onSubmit={gm.save}
          onClose={() => setSheet(null)}
        />
      ) : (
        <AccountSheet
          open={sheet === "logIn"}
          intent="logIn"
          onSubmit={gm.logIn}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function landingState(
  phase: Phase,
  group: { id: string; shareToken: string } | null | undefined,
  savedAs: string | undefined,
): LandingState {
  if (phase !== "created") return { phase };
  if (!group) return { phase: "creating" };
  return { phase, groupId: group.id, shareUrl: shareUrl(group.shareToken), savedAs };
}

function returningGroup(groups: { id: string }[] | undefined) {
  const last = localStorage.getItem(LAST_GROUP_KEY);
  return (groups?.find((group) => group.id === last) ?? groups?.[0])?.id ?? null;
}

function groupPath(groupId: string) {
  return `/g/${groupId}`;
}

function shareUrl(shareToken: string) {
  return `${window.location.origin}/s/${shareToken}`;
}
