import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../lib/errors";
import { Button, buttonClassName } from "../../ui/Button";
import { StatusScreen } from "../../ui/StatusScreen";

export type RemindersStatus = { enabled: boolean } | null | "no link" | undefined;

type Switch = () => Promise<unknown>;

export function RemindersOff({
  status,
  turnOff,
  turnOn,
}: {
  status: RemindersStatus;
  turnOff: Switch;
  turnOn: Switch;
}) {
  if (status === undefined) return <div className="min-h-dvh" />;
  if (status === "no link") {
    return (
      <StatusScreen
        headline="Open the link in your Reminder"
        explanation="Use the link at the foot of a Reminder again, or sign in to turn Reminders off or on from My groups."
      >
        <MyGroupsLink />
      </StatusScreen>
    );
  }
  if (status === null) {
    return (
      <StatusScreen
        headline="This link doesn't work"
        explanation="Sign in to turn Reminders off or on from My groups."
      >
        <MyGroupsLink />
      </StatusScreen>
    );
  }
  if (status.enabled) {
    return (
      <StatusScreen
        key="on"
        headline="Turn off Reminders?"
        explanation="You get an email 1 day and 2 hours before each session. Session updates stay as they are."
      >
        <SwitchButton
          label="Turn off Reminders"
          busyLabel="Turning off…"
          size="lg"
          onSwitch={turnOff}
        />
      </StatusScreen>
    );
  }
  return (
    <StatusScreen
      key="off"
      headline="Reminders are off"
      explanation="You get no email before a session. Session updates stay as they are."
    >
      <SwitchButton
        label="Turn them back on"
        busyLabel="Turning on…"
        variant="secondary"
        onSwitch={turnOn}
      />
      <MyGroupsLink />
    </StatusScreen>
  );
}

function MyGroupsLink() {
  return (
    <Link to="/me" className={buttonClassName("ghost", "md")}>
      Open My groups
    </Link>
  );
}

function SwitchButton({
  label,
  busyLabel,
  variant = "primary",
  size = "md",
  onSwitch,
}: {
  label: string;
  busyLabel: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  onSwitch: Switch;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (failure !== null) button.current?.focus();
  }, [failure]);

  const press = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onSwitch();
    } catch (error) {
      setFailure(errorMessage(error, "reminderLink"));
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3">
      <Button
        ref={button}
        variant={variant}
        size={size}
        busy={busy && busyLabel}
        onClick={() => void press()}
        className="w-full"
      >
        {label}
      </Button>
      {failure && (
        <p role="alert" className="text-sm font-medium text-busy">
          {failure}
        </p>
      )}
    </div>
  );
}
