import type { ComponentProps } from "react";
import { cn } from "./cn";
import { pressable } from "./interactive";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "free" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-[1.08] active:brightness-95",
  secondary: "border border-line-strong text-ink hover:border-ink-3 hover:bg-surface-hover",
  ghost: "text-ink hover:bg-surface-hover",
  soft: "bg-accent-soft text-accent-strong hover:brightness-95 dark:hover:brightness-110",
  free: "bg-free text-white hover:brightness-105 dark:text-paper",
  danger: "bg-busy text-white hover:brightness-95 dark:text-paper",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: string | false;
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-default aria-busy:opacity-40",
    pressable,
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const inFlight = busy !== false;
  return (
    <button
      type="button"
      disabled={disabled && !inFlight}
      aria-disabled={inFlight || undefined}
      aria-busy={inFlight || undefined}
      className={buttonClassName(variant, size, className)}
      onClick={(event) => (inFlight ? event.preventDefault() : onClick?.(event))}
      {...props}
    >
      {busy === false ? children : busy}
    </button>
  );
}
