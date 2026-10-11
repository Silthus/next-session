import { useState, type ReactNode } from "react";
import { cn } from "./cn";

export function ProfileImage({
  src,
  fallback,
  className,
}: {
  src: string | undefined;
  fallback: ReactNode;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (src === undefined || src === failedSrc) return fallback;
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={cn("rounded-full object-cover", className)}
    />
  );
}
