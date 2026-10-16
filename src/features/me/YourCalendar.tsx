import { useState } from "react";
import { errorMessage } from "../../lib/errors";
import { Button, buttonClassName } from "../../ui/Button";
import { IconCheck, IconCopy } from "../../ui/icons";
import { useCopy } from "../../ui/ShareLinkCard";

export type CalendarFeedActions = {
  subscribe: () => Promise<string>;
  reset: () => Promise<string>;
};

type Pending = "subscribe" | "reset";

export function YourCalendar({ calendarFeed }: { calendarFeed: CalendarFeedActions }) {
  const [url, setUrl] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState<string>();

  async function run(action: Pending) {
    setPending(action);
    setError(undefined);
    try {
      setUrl(await calendarFeed[action]());
    } catch (cause) {
      setError(errorMessage(cause, "calendarFeed"));
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Follow every session of your groups in your calendar app, moves and cancellations included.
      </p>
      {url === undefined ? (
        <Button
          variant="secondary"
          className="self-start"
          busy={pending === "subscribe" && "Making your link…"}
          onClick={() => void run("subscribe")}
        >
          Subscribe in your calendar app
        </Button>
      ) : (
        <>
          <FeedLink url={url} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              variant="ghost"
              size="sm"
              busy={pending === "reset" && "Resetting…"}
              onClick={() => void run("reset")}
            >
              Reset feed link
            </Button>
            <p className="text-xs text-ink-3">Stops the old link at once.</p>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-busy">
          {error}
        </p>
      )}
    </div>
  );
}

function FeedLink({ url }: { url: string }) {
  const { copyState, copy } = useCopy(url, "me", (method) => ({
    name: "calendar_feed_copied",
    method,
  }));
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Calendar feed link"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-sm text-ink"
        />
        <Button
          variant={copyState === "copied" ? "free" : "primary"}
          onClick={() => void copy()}
          className="min-w-28"
        >
          {copyState === "copied" ? <IconCheck /> : <IconCopy />}
          {copyState === "copied" ? "Copied" : "Copy link"}
        </Button>
      </div>
      {copyState === "blocked" && (
        <p className="text-xs text-ink-2">Long-press the link to copy it.</p>
      )}
      <a href={webcalOf(url)} className={buttonClassName("secondary", "md", "self-start")}>
        Open in calendar app
      </a>
      <p className="text-sm text-ink-3">
        In Google Calendar, paste the link under Other calendars → From URL. Changes can take up to
        a day to show there.
      </p>
    </>
  );
}

function webcalOf(url: string) {
  return url.replace(/^https?:\/\//, "webcal://");
}
