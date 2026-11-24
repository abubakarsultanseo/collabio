import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] shadow-sm dark:text-[var(--canvas)]",
        secondary:
          "border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--canvas)]",
        outline:
          "border border-[var(--border)] text-[var(--text)] hover:bg-[var(--canvas)]",
        ghost: "text-[var(--muted)] hover:bg-[var(--canvas)]",
        destructive: "bg-[#c5221f] text-white hover:bg-[#a50e0e]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
