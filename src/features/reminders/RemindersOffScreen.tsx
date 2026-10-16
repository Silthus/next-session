import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RemindersOff } from "./RemindersOff";

export function RemindersOffScreen({ token }: { token: string | undefined }) {
  const status = useQuery(api.reminderLinks.status, token === undefined ? "skip" : { token });
  const turnOff = useMutation(api.reminderLinks.turnOff);
  const turnOn = useMutation(api.reminderLinks.turnOn);
  return (
    <RemindersOff
      status={token === undefined ? "no link" : status}
      turnOff={() => turnOff({ token: token ?? "" })}
      turnOn={() => turnOn({ token: token ?? "" })}
    />
  );
}
