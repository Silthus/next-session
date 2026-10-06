// Walks a Tips workflow definition along every path from the trigger to each email step.
// A Tip may only go out if no time since the trigger passed unwatched: the path has no plain
// delay, and the step right before the email is a wait for a scheduled Session that timed out.
// A wait resolved by a scheduled Session must never lead to an email.
import { readFileSync } from "node:fs";

const flow = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byId = new Map(flow.actions.map((a) => [a.id, a]));
const waitsForSession = (a) =>
  a.type === "wait_until_condition" &&
  a.config.events?.some((e) => e.filters.events.some((ev) => ev.id === "next_session:session_scheduled"));

let failures = 0;
const fail = (message) => {
  failures++;
  console.log(`FAIL ${message}`);
};

const walk = (id, path, resolvedBySession) => {
  const action = byId.get(id);
  const here = [...path, id];
  if (action.type === "function_email") {
    const previous = byId.get(path.at(-1));
    const unwatchedDelay = here.some((step) => byId.get(step).type === "delay");
    if (resolvedBySession) fail(`${here.join(" -> ")}: sent after a Session was scheduled`);
    else if (unwatchedDelay) fail(`${here.join(" -> ")}: a delay on the path watches no Session`);
    else if (!waitsForSession(previous)) fail(`${here.join(" -> ")}: no Session wait right before it`);
    else console.log(`ok   ${here.join(" -> ")}`);
  }
  for (const edge of flow.edges.filter((e) => e.from === id)) {
    const resolved = waitsForSession(action) && edge.type === "branch";
    walk(edge.to, here, resolvedBySession || resolved);
  }
};

walk(flow.actions.find((a) => a.type === "trigger").id, [], false);
console.log(failures === 0 ? "PASS" : `${failures} failing path(s)`);
process.exit(failures === 0 ? 0 : 1);
