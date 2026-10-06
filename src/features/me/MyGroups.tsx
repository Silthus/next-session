import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import type { IsoDate } from "../../../shared/dates";
import { Button } from "../../ui/Button";
import { IconMore, IconStar } from "../../ui/icons";
import { PageShell } from "../../ui/PageShell";
import { Skeleton } from "../../ui/Skeleton";
import { dayLabel, longDayLabel, relativeDay } from "../group/calendar/calendarDates";
import { MenuButton, Popover } from "../group/rail/Popover";
import {
  daysToAnswer,
  nextSessions,
  type GroupPage,
  type MyGroups as MyGroupsData,
  type PlayingGroup,
  type RunningGroup,
} from "./myGroups";

type MyGroupsProps = {
  email: string | undefined;
  groups: MyGroupsData | undefined;
  today: IsoDate;
  creating: boolean;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onCreate: () => void;
  onRemove: (group: PlayingGroup) => void;
  onLogOut: () => void;
};

const cardClassName =
  "rounded-lg border border-line bg-surface shadow-card transition-colors hover:border-line-strong";

export function MyGroups({
  email,
  groups,
  today,
  creating,
  headingRef,
  onCreate,
  onRemove,
  onLogOut,
}: MyGroupsProps) {
  const ownHeading = useRef<HTMLHeadingElement>(null);
  const heading = headingRef ?? ownHeading;
  useEffect(() => heading.current?.focus(), [heading]);

  return (
    <PageShell
      headerEnd={<AccountLine email={email} onLogOut={onLogOut} />}
      className="flex flex-col gap-8 pt-4"
    >
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-4xl font-extrabold tracking-tight outline-none"
      >
        My groups
      </h1>
      {groups === undefined ? (
        <MyGroupsLoading />
      ) : groups.running.length === 0 && groups.playing.length === 0 ? (
        <NoGroups creating={creating} onCreate={onCreate} />
      ) : (
        <>
          <NextSessions groups={groups} today={today} />
          {groups.playing.length > 0 && (
            <PlayingGroups groups={groups.playing} onRemove={onRemove} />
          )}
          <RunningGroups groups={groups.running} creating={creating} onCreate={onCreate} />
        </>
      )}
    </PageShell>
  );
}

function AccountLine({ email, onLogOut }: { email: string | undefined; onLogOut: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="max-w-[45vw] truncate text-sm text-ink-3">{email}</span>
      <Button variant="ghost" size="sm" onClick={onLogOut}>
        Log out
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className="font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function NextSessions({ groups, today }: { groups: MyGroupsData; today: IsoDate }) {
  const sessions = nextSessions(groups);
  return (
    <Section title="Next sessions">
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing scheduled yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li key={`${session.date}-${pageKey(session.to)}`}>
              <GroupPageLink
                to={session.to}
                className="flex items-center gap-3 rounded-md border border-accent/40 bg-accent-soft/50 px-3 py-2.5 transition-colors hover:bg-accent-soft"
              >
                <IconStar className="size-5 shrink-0 text-accent-strong" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{longDayLabel(session.date)}</span>
                  <span className="block text-xs text-ink-3">
                    {relativeDay(session.date, today)}
                  </span>
                </span>
                <span className="max-w-[45%] truncate text-sm font-medium text-ink-2">
                  {session.groupName}
                </span>
              </GroupPageLink>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PlayingGroups({
  groups,
  onRemove,
}: {
  groups: PlayingGroup[];
  onRemove: (group: PlayingGroup) => void;
}) {
  return (
    <Section title="You play in">
      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <li key={group.groupId} className={`${cardClassName} relative`}>
            <GroupPageLink
              to={{ kind: "player", shareToken: group.shareToken }}
              className="flex flex-col gap-1 p-4 pr-14"
            >
              <GroupName name={group.name} />
              <span className="text-sm text-ink-2">as {group.playerName}</span>
              <NextSession dates={group.upcomingSessions} />
              <OpenDates openDates={group.openDates} />
            </GroupPageLink>
            <div className="absolute top-1.5 right-1.5">
              <GroupMenu group={group} onRemove={onRemove} />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function GroupMenu({
  group,
  onRemove,
}: {
  group: PlayingGroup;
  onRemove: (group: PlayingGroup) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover
      triggerRef={trigger}
      align="end"
      className="w-56"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Options for ${group.name}`}
          className="rounded-md p-2.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <IconMore />
        </button>
      )}
    >
      <MenuButton onSelect={() => onRemove(group)}>Remove from my groups</MenuButton>
    </Popover>
  );
}

function RunningGroups({
  groups,
  creating,
  onCreate,
}: {
  groups: RunningGroup[];
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <Section title="You run">
      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-3">Run a game yourself, and your players answer here.</p>
          <CreateLink creating={creating} onCreate={onCreate} variant="secondary" />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.groupId} className={cardClassName}>
              <GroupPageLink
                to={{ kind: "gm", groupId: group.groupId }}
                className="flex flex-col gap-1 p-4"
              >
                <GroupName name={group.name} />
                <NextSession dates={group.upcomingSessions} />
              </GroupPageLink>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function NoGroups({ creating, onCreate }: { creating: boolean; onCreate: () => void }) {
  return (
    <div className={`${cardClassName} flex flex-col items-start gap-4 p-6`}>
      <p className="text-lg text-ink-2">Open your GM's link and tap Keep this group.</p>
      <p className="text-sm text-ink-3">Running a game yourself?</p>
      <CreateLink creating={creating} onCreate={onCreate} variant="primary" />
    </div>
  );
}

function CreateLink({
  creating,
  onCreate,
  variant,
}: {
  creating: boolean;
  onCreate: () => void;
  variant: "primary" | "secondary";
}) {
  return (
    <Button variant={variant} onClick={onCreate} busy={creating && "Making your link…"}>
      Create your link
    </Button>
  );
}

function GroupName({ name }: { name: string }) {
  return <span className="font-display text-lg font-bold break-words">{name}</span>;
}

function NextSession({ dates }: { dates: IsoDate[] }) {
  const [next] = dates;
  return (
    <span className="text-sm text-ink-3">
      {next === undefined ? "No session yet" : `Next session ${dayLabel(next)}`}
    </span>
  );
}

function OpenDates({ openDates }: { openDates: number }) {
  const copy = daysToAnswer(openDates);
  if (copy === null) return null;
  return (
    <span className="mt-1 self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
      {copy}
    </span>
  );
}

function GroupPageLink({
  to,
  className,
  children,
}: {
  to: GroupPage;
  className: string;
  children: ReactNode;
}) {
  if (to.kind === "gm") {
    return (
      <Link to="/g/$groupId" params={{ groupId: to.groupId }} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/s/$shareToken" params={{ shareToken: to.shareToken }} className={className}>
      {children}
    </Link>
  );
}

function pageKey(page: GroupPage) {
  return page.kind === "gm" ? page.groupId : page.shareToken;
}

function MyGroupsLoading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Loading your groups</span>
      <Skeleton className="h-14 rounded-md" />
      <Skeleton className="h-14 rounded-md" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    </div>
  );
}
