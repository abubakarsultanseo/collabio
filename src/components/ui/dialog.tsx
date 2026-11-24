"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

type DialogContentProps = {
  title: string;
  description: string;
  children: ReactNode;
  closeDisabled?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
};

export function DialogContent({
  title,
  description,
  children,
  closeDisabled,
  initialFocus,
  className,
}: DialogContentProps) {
  const previousFocus = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#202124]/40 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl",
          className,
        )}
        onOpenAutoFocus={(event) => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          if (initialFocus?.current) {
            event.preventDefault();
            initialFocus.current.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (previousFocus.current?.isConnected) {
            event.preventDefault();
            previousFocus.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (closeDisabled) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (closeDisabled) event.preventDefault();
        }}
      >
        <DialogPrimitive.Title className="pr-9 text-lg font-semibold">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 text-sm text-[var(--muted)]">
          {description}
        </DialogPrimitive.Description>
        <DialogPrimitive.Close
          type="button"
          aria-label="Close dialog"
          disabled={closeDisabled}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--canvas)]"
        >
          <X size={16} />
        </DialogPrimitive.Close>
        <div className="mt-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
