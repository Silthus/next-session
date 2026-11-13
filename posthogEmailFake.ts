// A fake of PostHog's email API for the Convex tests. It answers the file uploads of a send with
// attachments and keeps each file's bytes by its hash, and hands every other request, the sends
// and telemetry included, to the test's own `answer`.

const APP_HOST = "https://eu.posthog.com";
export const POSTHOG_SEND_URL = `${APP_HOST}/api/projects/@current/messaging/send/email/`;
const UPLOADS_URL = `${APP_HOST}/api/projects/@current/messaging/attachments/uploads/`;
const STORAGE_URL = "https://storage.posthog.test/";

export type SentAttachment = {
  sha256: string;
  filename: string;
  content_type?: string;
  content_id?: string;
};

// The body of a code send, as PostHog receives it.
export type SentEmail = {
  template_key: string;
  to: string;
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  reply_to?: string[];
  distinct_id?: string;
  sensitive?: boolean;
  tracking?: boolean | { opens?: boolean; clicks?: boolean; engagement?: boolean };
  attachments?: SentAttachment[];
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function postHogEmailFake(answer: Fetch) {
  const files = new Map<string, Uint8Array>();

  async function fetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = urlOf(input);
    if (url === UPLOADS_URL) {
      const { files: requested } = JSON.parse(init!.body as string) as {
        files: { sha256: string }[];
      };
      return Response.json({
        files: requested.map(({ sha256 }) =>
          files.has(sha256)
            ? { sha256, status: "present" }
            : { sha256, status: "upload", url: `${STORAGE_URL}${sha256}`, headers: {} },
        ),
      });
    }
    if (url.startsWith(STORAGE_URL)) {
      files.set(url.slice(STORAGE_URL.length), new Uint8Array(init!.body as Uint8Array));
      return new Response(null, { status: 200 });
    }
    return await answer(input, init);
  }

  // The text of a file a send names, as PostHog's file storage received it.
  function fileText({ sha256 }: SentAttachment) {
    const bytes = files.get(sha256);
    if (bytes === undefined) throw new Error(`No file was uploaded with hash ${sha256}`);
    return new TextDecoder().decode(bytes);
  }

  return { fetch, fileText };
}

// PostHog's answer to a send it took.
export function accepted() {
  return Response.json({ message_id: "message-1" }, { status: 200 });
}

export function urlOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}
