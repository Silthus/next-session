import { Link } from "@tanstack/react-router";
import { buttonClassName, type ButtonSize } from "./Button";
import { StatusScreen } from "./StatusScreen";

export type NotFoundKind = "page" | "link";

type NotFoundCopy = {
  headline: string;
  explanation: string;
  ctaSize: ButtonSize;
};

const copies: Record<NotFoundKind, NotFoundCopy> = {
  page: {
    headline: "Nothing here",
    explanation: "The page you were looking for does not exist.",
    ctaSize: "md",
  },
  link: {
    headline: "This link no longer works",
    explanation:
      "The GM may have rotated the link or deleted the group. Ask them for the current one.",
    ctaSize: "lg",
  },
};

export function NotFoundScreen({ kind }: { kind: NotFoundKind }) {
  const { headline, explanation, ctaSize } = copies[kind];
  return (
    <StatusScreen headline={headline} explanation={explanation}>
      <div className="mt-2 flex flex-col items-center gap-2">
        <Link to="/" className={buttonClassName("secondary", ctaSize)}>
          Plan your own game
        </Link>
        <span className="text-xs text-ink-3">One click, no sign-up.</span>
      </div>
    </StatusScreen>
  );
}
