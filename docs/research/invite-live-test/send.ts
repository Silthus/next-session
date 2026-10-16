import { buildIcs, contentType, type Invite, type LocalDateTime, type Method } from "./ics";

type Track = "request" | "publish";
type Change = "invite" | "move" | "cancel";
type Encoding = "base64" | "text";

const STEPS: Record<string, { track: Track; change: Change }> = {
  request: { track: "request", change: "invite" },
  "request-move": { track: "request", change: "move" },
  "request-cancel": { track: "request", change: "cancel" },
  publish: { track: "publish", change: "invite" },
  "publish-move": { track: "publish", change: "move" },
  "publish-cancel": { track: "publish", change: "cancel" },
};

const REMINDER_MINUTES_BEFORE = 120;

const options = parseArgs(process.argv.slice(2));
const sender = process.env.INVITE_FROM ?? "Next Session <hello@next-session.link>";

async function sendStep(stepName: string, recipients: string[]) {
  const ids: string[] = [];
  for (const recipient of recipients) {
    ids.push(await send(stepName, recipient, options.encoding));
  }
  console.log(`Sent ${stepName} for run ${options.run} to ${recipients.length} inbox(es).`);
  console.log(`Resend ids: ${ids.join(", ")}`);
  console.log(`Follow-up steps reuse the run: --run ${options.run}`);
}

async function send(stepName: string, recipient: string, encoding: Encoding): Promise<string> {
  const step = STEPS[stepName];
  if (step === undefined)
    fail(`Unknown step "${stepName}". Steps: ${Object.keys(STEPS).join(", ")}, mime-check`);

  const invite = inviteFor(step.track, step.change, recipient);
  const ics = buildIcs(invite);
  const payload = {
    from: sender,
    to: [recipient],
    subject: subjectFor(stepName, invite),
    text: bodyText(stepName, invite),
    html: `<p>${bodyText(stepName, invite).replace(/\n/g, "<br>")}</p>`,
    attachments: [
      {
        filename: "invite.ics",
        content: encoding === "base64" ? Buffer.from(ics, "utf8").toString("base64") : ics,
        content_type: contentType(invite.method),
      },
    ],
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ ...payload, to: ["<recipient>"] }, null, 2));
    console.log(ics.replace(/mailto:[^\r\n]+/g, "mailto:<redacted>"));
    return "dry-run";
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || result.id === undefined)
    fail(`Resend refused ${stepName}: ${response.status} ${result.message ?? ""}`);
  return result.id;
}

function inviteFor(track: Track, change: Change, recipient: string): Invite {
  const method: Method =
    change === "cancel" ? "CANCEL" : track === "request" ? "REQUEST" : "PUBLISH";
  return {
    method,
    uid: `${options.run}-${track}@next-session.link`,
    sequence: { invite: 0, move: 1, cancel: 2 }[change],
    stamp: new Date(),
    start: startFor(track, change),
    durationHours: 4,
    summary: `Spieleabend ${track === "request" ? "A" : "B"} · Live-Test`,
    location: "Musterstraße 1, 50667 Köln, Deutschland",
    description: "Next Session invite live test (#129). Nothing to do here.",
    url: "https://next-session.link",
    organizer: addressOf(sender),
    attendee: track === "request" ? recipient : undefined,
    reminderMinutesBefore: REMINDER_MINUTES_BEFORE,
  };
}

function startFor(track: Track, change: Change): LocalDateTime {
  const base = firstSaturdayAWeekAfter(options.run);
  const dayOffset = (track === "publish" ? 1 : 0) + (change === "invite" ? 0 : 7);
  const day = new Date(base.getTime() + dayOffset * 86_400_000);
  const moved = change !== "invite";
  return {
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
    hour: track === "request" ? 19 : 18,
    minute: moved ? 30 : 0,
  };
}

function firstSaturdayAWeekAfter(run: string): Date {
  const start = new Date(`${run}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) fail(`--run must be a date like 2026-10-16, got "${run}"`);
  const weekLater = new Date(start.getTime() + 7 * 86_400_000);
  const daysToSaturday = (6 - weekLater.getUTCDay() + 7) % 7;
  return new Date(weekLater.getTime() + daysToSaturday * 86_400_000);
}

function subjectFor(stepName: string, invite: Invite): string {
  const { day, month, hour, minute } = invite.start;
  const when = `${day}.${month}. ${hour}:${String(minute).padStart(2, "0")}`;
  return `[Live-Test ${options.run} ${stepName}] ${invite.summary} – ${when}`;
}

function bodyText(stepName: string, invite: Invite): string {
  return [
    `Step: ${stepName}, METHOD:${invite.method}, SEQUENCE:${invite.sequence}, UID ${invite.uid}.`,
    `Expected start: ${invite.start.day}.${invite.start.month}.${invite.start.year} ${invite.start.hour}:${String(invite.start.minute).padStart(2, "0")} Berlin time; reminder ${REMINDER_MINUTES_BEFORE} minutes before.`,
    "Next Session invite live test (#129).",
  ].join("\n");
}

async function mimeCheck() {
  const inbox = await createDisposableInbox();
  console.log("Disposable inbox created (address not printed).");
  const sends: Array<{ label: string; step: string; encoding: Encoding }> = [
    { label: "REQUEST, base64 content", step: "request", encoding: "base64" },
    { label: "REQUEST, text content", step: "request", encoding: "text" },
    { label: "PUBLISH, base64 content", step: "publish", encoding: "base64" },
    { label: "CANCEL, base64 content", step: "request-cancel", encoding: "base64" },
  ];
  for (const { step, encoding } of sends) await send(step, inbox.address, encoding);
  if (options.dryRun) return;

  const sources = await waitForSources(inbox, sends.length);
  const rawDirectory = `${process.env.HOME}/.config/next-session/invite-test-raw/${Date.now()}`;
  await Promise.all(
    sources.map((source, index) => Bun.write(`${rawDirectory}/${index}.eml`, source)),
  );
  console.log(`Raw sources saved privately to ${rawDirectory}`);
  for (const source of sources) {
    console.log(`\n=== ${subjectLine(source)}`);
    console.log(mimeSkeleton(source).replaceAll(inbox.address, "<inbox>"));
  }
}

type DisposableInbox = { address: string; token: string };

const MAIL_TM = "https://api.mail.tm";

async function createDisposableInbox(): Promise<DisposableInbox> {
  if (options.dryRun) return { address: "inbox@example.test", token: "" };
  const domains = (await (await fetch(`${MAIL_TM}/domains`)).json()) as {
    "hydra:member": Array<{ domain: string }>;
  };
  const domain = domains["hydra:member"][0]?.domain ?? fail("mail.tm offers no domain");
  const address = `ns-invite-${crypto.randomUUID().slice(0, 8)}@${domain}`;
  const password = crypto.randomUUID();
  await mailTm("/accounts", { address, password });
  const { token } = (await mailTm("/token", { address, password })) as { token: string };
  return { address, token };
}

async function mailTm(path: string, body: object): Promise<unknown> {
  const response = await fetch(`${MAIL_TM}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) fail(`mail.tm ${path} answered ${response.status}`);
  return response.json();
}

async function waitForSources(inbox: DisposableInbox, expected: number): Promise<string[]> {
  const headers = { Authorization: `Bearer ${inbox.token}` };
  for (let attempt = 0; attempt < 36; attempt++) {
    const list = (await (await fetch(`${MAIL_TM}/messages`, { headers })).json()) as {
      "hydra:member": Array<{ id: string }>;
    };
    if (list["hydra:member"].length >= expected) {
      return Promise.all(
        list["hydra:member"].map(async ({ id }) => {
          const source = (await (await fetch(`${MAIL_TM}/sources/${id}`, { headers })).json()) as {
            data: string;
          };
          return source.data;
        }),
      );
    }
    await Bun.sleep(5_000);
  }
  fail(`Fewer than ${expected} mails arrived within 3 minutes`);
}

function subjectLine(source: string): string {
  return source.match(/^Subject: (.*)$/m)?.[1] ?? "(no subject)";
}

function mimeSkeleton(source: string): string {
  const interesting =
    /^(Content-Type|Content-Transfer-Encoding|Content-Disposition|MIME-Version|\s+(boundary|charset|method|name|filename)=)/i;
  const calendarStart = source.search(/BEGIN:VCALENDAR/);
  const calendarHead =
    calendarStart >= 0
      ? source.slice(calendarStart, calendarStart + 200).replace(/mailto:\S+/g, "mailto:<redacted>")
      : "(no plain-text VCALENDAR in the source)";
  const headerLines = source.split(/\r?\n/).filter((line) => interesting.test(line));
  return [...headerLines, "--- first calendar bytes ---", calendarHead].join("\n");
}

function recipientsFromEnv(): string[] {
  if (options.dryRun) return ["player@example.test"];
  const recipients = requiredEnv("INVITE_TO")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (recipients.length === 0) fail("INVITE_TO holds no address");
  return recipients;
}

function addressOf(mailbox: string): string {
  return mailbox.match(/<([^>]+)>/)?.[1] ?? mailbox;
}

function requiredEnv(name: string): string {
  return process.env[name] ?? fail(`${name} is not set; see README.md`);
}

function parseArgs(args: string[]) {
  const flag = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const encoding = flag("--content") ?? "base64";
  if (encoding !== "base64" && encoding !== "text") fail(`--content must be base64 or text`);
  return {
    command: args[0] ?? fail("Name a step first, then flags"),
    run: flag("--run") ?? new Date().toISOString().slice(0, 10),
    encoding: encoding as Encoding,
    dryRun: args.includes("--dry-run"),
  };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (options.command === "mime-check") {
  await mimeCheck();
} else {
  await sendStep(options.command, recipientsFromEnv());
}
