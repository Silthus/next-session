import type { ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "free" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-105 active:brightness-95",
  secondary: "border border-line-strong text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
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
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-[background-color,color,transform,border-color,filter] duration-150 ease-(--ease-snap) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
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
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy !== false}
      aria-busy={busy !== false || undefined}
      className={buttonClassName(variant, size, className)}
      {...props}
    >
      {busy === false ? children : busy}
    </button>
  );
}
