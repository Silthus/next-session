import { buildIcs, contentType, type Invite, type LocalDateTime } from "./ics";

type Step = "accepted" | "accepted-cancel";
type Target = "disposable" | "inboxes";

const MAIL_TM = "https://api.mail.tm";
const SENDER = "Next Session <hello@next-session.link>";
const RUN = new Date().toISOString().slice(0, 10);

const [step, target] = process.argv.slice(2) as [Step, Target];
if (!["accepted", "accepted-cancel"].includes(step) || !["disposable", "inboxes"].includes(target))
  fail("Usage: send.ts <accepted|accepted-cancel> <disposable|inboxes>");

if (target === "disposable") await checkRawMime();
else await sendToInboxes();

async function sendToInboxes() {
  const recipients = requiredEnv("INVITE_TO")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const ids = [];
  for (const recipient of recipients) ids.push(await send(recipient));
  console.log(`Sent ${step} to ${recipients.length} inbox(es). Resend ids: ${ids.join(", ")}`);
}

async function checkRawMime() {
  const inbox = await createDisposableInbox();
  const id = await send(inbox.address);
  console.log(`Sent ${step} to a disposable inbox (address not printed). Resend id: ${id}`);
  const source = await waitForSource(inbox);
  const calendar = decodedCalendar(source);
  console.log(redact(mimeHeaders(source), inbox.address));
  console.log("--- decoded calendar ---");
  console.log(redact(calendar, inbox.address));
}

function invite(recipient: string): Invite {
  return {
    method: step === "accepted" ? "REQUEST" : "CANCEL",
    uid: `${RUN}-rsvp-accepted@next-session.link`,
    sequence: step === "accepted" ? 0 : 1,
    stamp: new Date(),
    start: firstSaturdayTwoWeeksOut(),
    durationHours: 4,
    summary: "Spieleabend C · RSVP-Test",
    location: "Musterstraße 1, 50667 Köln, Deutschland",
    description: "Next Session RSVP live send (#126): PARTSTAT=ACCEPTED, RSVP=FALSE.",
    url: "https://next-session.link",
    organizer: "hello@next-session.link",
    attendee: recipient,
    attendeeStatus: "ACCEPTED",
  };
}

async function send(recipient: string): Promise<string> {
  const calendar = invite(recipient);
  const ics = buildIcs(calendar);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SENDER,
      to: [recipient],
      subject: `[RSVP-Test ${RUN} ${step}] ${calendar.summary}`,
      text: "Next Session RSVP live send (#126). The invite arrives already accepted; no reply needed.",
      html: "<p>Next Session RSVP live send (#126). The invite arrives already accepted; no reply needed.</p>",
      attachments: [
        {
          filename: "invite.ics",
          content: Buffer.from(ics, "utf8").toString("base64"),
          content_type: contentType(calendar.method),
        },
      ],
    }),
  });
  const result = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || result.id === undefined)
    fail(`Resend refused ${step}: ${response.status} ${result.message ?? ""}`);
  return result.id;
}

function firstSaturdayTwoWeeksOut(): LocalDateTime {
  const start = new Date(Date.now() + 14 * 86_400_000);
  const saturday = new Date(start.getTime() + ((6 - start.getUTCDay() + 7) % 7) * 86_400_000);
  return {
    year: saturday.getUTCFullYear(),
    month: saturday.getUTCMonth() + 1,
    day: saturday.getUTCDate(),
    hour: 19,
    minute: 0,
  };
}

async function createDisposableInbox() {
  const domains = (await (await fetch(`${MAIL_TM}/domains`)).json()) as {
    "hydra:member": Array<{ domain: string }>;
  };
  const domain = domains["hydra:member"][0]?.domain ?? fail("mail.tm offers no domain");
  const address = `ns-rsvp-${crypto.randomUUID().slice(0, 8)}@${domain}`;
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

async function waitForSource(inbox: { token: string }): Promise<string> {
  const headers = { Authorization: `Bearer ${inbox.token}` };
  for (let attempt = 0; attempt < 36; attempt++) {
    const list = (await (await fetch(`${MAIL_TM}/messages`, { headers })).json()) as {
      "hydra:member": Array<{ id: string }>;
    };
    const first = list["hydra:member"][0];
    if (first) {
      const source = (await (await fetch(`${MAIL_TM}/sources/${first.id}`, { headers })).json()) as {
        data: string;
      };
      return source.data;
    }
    await Bun.sleep(5_000);
  }
  fail("No mail arrived within 3 minutes");
}

function mimeHeaders(source: string): string {
  const interesting =
    /^(Content-Type|Content-Transfer-Encoding|Content-Disposition|DKIM-Signature|Received: from)/i;
  return source
    .split(/\r?\n/)
    .filter((line) => interesting.test(line))
    .join("\n");
}

function decodedCalendar(source: string): string {
  const part = source.split(/Content-Type: text\/calendar/i)[1] ?? fail("No calendar part");
  const body = part.split(/\r?\n\r?\n/)[1]?.split(/\r?\n--/)[0] ?? fail("Empty calendar part");
  return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
}

function redact(text: string, address: string): string {
  return text.replaceAll(address, "<inbox>").replace(/mailto:[^\s;]+/g, "mailto:<redacted>");
}

function requiredEnv(name: string): string {
  return process.env[name] ?? fail(`${name} is not set`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
