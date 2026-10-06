import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { Button } from "../../../ui/Button";
import { menuItemClassName, MenuButton, Popover, useClosePopover } from "./Popover";

type HeaderAccountProps =
  | { status: "anonymous"; onSave: () => void }
  | { status: "account"; email: string | undefined; onLogOut: () => void };

export function HeaderAccount(props: HeaderAccountProps) {
  if (props.status === "anonymous") {
    return (
      <Button variant="soft" size="sm" onClick={props.onSave} aria-label="Save your group">
        <span className="sm:hidden">Save</span>
        <span className="hidden sm:inline">Save your group</span>
      </Button>
    );
  }
  return <AccountMenu email={props.email} onLogOut={props.onLogOut} />;
}

function AccountMenu({ email, onLogOut }: { email: string | undefined; onLogOut: () => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover
      triggerRef={trigger}
      align="end"
      className="w-64"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label="Your account"
          className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-strong uppercase hover:brightness-95"
        >
          {(email ?? "?").slice(0, 1)}
        </button>
      )}
    >
      <p className="px-2 pt-1 text-xs text-ink-3">Signed in as</p>
      <p className="truncate px-2 pb-2 text-sm font-semibold">{email}</p>
      <div className="mb-1.5 border-t border-line" />
      <MyGroupsLink />
      <MenuButton onSelect={onLogOut}>Log out</MenuButton>
    </Popover>
  );
}

function MyGroupsLink() {
  const close = useClosePopover();
  return (
    <Link to="/me" className={menuItemClassName} onClick={() => close({ refocus: false })}>
      My groups
    </Link>
  );
}
