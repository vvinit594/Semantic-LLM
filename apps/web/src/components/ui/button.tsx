import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

const variants = {
  primary:
    "bg-accent text-accent-contrast hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-muted-surface disabled:hover:bg-surface",
  ghost: "text-secondary hover:bg-muted-surface hover:text-ink disabled:hover:bg-transparent",
} as const;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-control px-3.5 py-2 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
