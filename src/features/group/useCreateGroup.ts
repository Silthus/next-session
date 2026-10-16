import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { browserTimeZone } from "../../lib/timeZone";

export function useCreateGroup() {
  const createGroup = useMutation(api.groups.create);
  return () => createGroup({ timeZone: browserTimeZone() });
}
