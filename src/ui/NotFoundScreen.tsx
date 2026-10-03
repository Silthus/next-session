import { Link } from "@tanstack/react-router";
import { buttonClassName } from "./Button";
import { Logo } from "./Logo";
import { PageShell } from "./PageShell";

const copy = {
  page: {
    title: "Nothing here",
    body: "The page you were looking for does not exist.",
  },
  link: {
    title: "This link no longer works",
    body: "The GM may have rotated the link or deleted the group. Ask them for the current one.",
  },
};

export function NotFoundScreen({ kind = "page" }: { kind?: keyof typeof copy }) {
  const { title, body } = copy[kind];
  return (
    <PageShell
      maxWidth="md"
      centerFooter
      className="flex flex-col items-center justify-center gap-5 text-center"
    >
      <Logo muted className="size-14" />
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      <p className="text-ink-2">{body}</p>
      <div className="mt-2 flex flex-col items-center gap-2">
        <Link to="/" className={buttonClassName("secondary")}>
          Plan your own game
        </Link>
        <span className="text-xs text-ink-3">One click, no sign-up.</span>
      </div>
    </PageShell>
  );
}
