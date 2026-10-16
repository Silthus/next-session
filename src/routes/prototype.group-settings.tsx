// PROTOTYPE for #128, throwaway: three variants of the Group settings page, switchable via ?variant=,
// on the throwaway /prototype/group-settings route. ?board= shows every state side by side.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Board, variants, type BoardKey } from "../features/group/settings/prototype/Board";
import { EntryPoint, entryStates, type EntryState } from "../features/group/settings/prototype/EntryPoints";
import { pageStates, setupFor, type PageState } from "../features/group/settings/prototype/states";
import { VariantA } from "../features/group/settings/prototype/VariantA";
import { VariantB } from "../features/group/settings/prototype/VariantB";
import { VariantC } from "../features/group/settings/prototype/VariantC";
import { PrototypeSwitcher } from "../ui/PrototypeSwitcher";

type Search = { variant?: string; state?: string; board?: string; entry?: string; frame?: string };

export const Route = createFileRoute("/prototype/group-settings")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    variant: typeof search.variant === "string" ? search.variant : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    board: typeof search.board === "string" ? search.board : undefined,
    entry: typeof search.entry === "string" ? search.entry : undefined,
    frame: search.frame === undefined ? undefined : String(search.frame),
  }),
  component: GroupSettingsPrototype,
});

function GroupSettingsPrototype() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/prototype/group-settings" });

  if (search.entry && entryStates.includes(search.entry as EntryState)) {
    return <EntryPoint state={search.entry as EntryState} />;
  }
  if (search.board || (!search.variant && !search.state)) {
    return <Board board={(search.board as BoardKey | undefined) ?? "A"} />;
  }

  const variant = search.variant ?? "A";
  const state: PageState = pageStates.includes(search.state as PageState) ? (search.state as PageState) : "empty";
  const setup = setupFor(state);
  const key = `${variant}-${state}`;
  return (
    <>
      {variant === "A" && <VariantA key={key} setup={setup} />}
      {variant === "B" && <VariantB key={key} setup={setup} />}
      {variant === "C" && <VariantC key={key} setup={setup} />}
      {search.frame === undefined && (
        <PrototypeSwitcher
          variants={variants}
          current={variant}
          onChange={(next) => void navigate({ search: (previous) => ({ ...previous, variant: next }) })}
        />
      )}
    </>
  );
}
