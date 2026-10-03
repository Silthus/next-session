import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "free" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong shadow-card",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  soft: "bg-accent-soft text-accent-strong hover:brightness-95 dark:hover:brightness-110",
  free: "bg-free text-white hover:brightness-105 dark:text-paper",
  danger: "bg-busy text-white hover:brightness-95 dark:text-paper",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-14 px-6 text-base gap-2.5 rounded-lg",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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
    "inline-flex shrink-0 items-center justify-center font-semibold transition-[background-color,color,transform,border-color,filter] duration-150 ease-(--ease-snap) active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
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
