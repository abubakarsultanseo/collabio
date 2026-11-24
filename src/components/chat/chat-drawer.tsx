"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/components/chat/chat-thread";
import { cn } from "@/lib/utils";

export type ChatTarget = {
  kind: "request" | "direct";
  threadId: string;
  title?: string;
  onRead?: (id: string) => void;
  nextUnread?: () => ChatTarget | undefined;
};

type ChatControls = {
  open: (target: ChatTarget) => void;
  active: ChatTarget | null;
};
const ChatContext = createContext<ChatControls | null>(null);

export function ChatHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<{
    target: ChatTarget;
    pathname: string;
  } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const active = selection?.pathname === pathname ? selection.target : null;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setSelection((current) =>
      current?.pathname === pathname ? current : null,
    );
  }, [pathname]);

  const open = useCallback(
    (target: ChatTarget) => {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        !focused.closest("[data-chat-panel]")
      )
        trigger.current = focused;
      setSelection({ pathname, target });
    },
    [pathname],
  );

  return (
    <ChatContext.Provider value={{ open, active }}>
      <div className={cn("min-w-0", active && "lg:mr-[28rem]")}>{children}</div>
      <Dialog.Root
        open={!!active}
        modal={mobile}
        onOpenChange={(value) => {
          if (!value) setSelection(null);
        }}
      >
        {active && (
          <Dialog.Portal>
            <Dialog.Content
              className="fixed inset-y-0 right-0 z-40 flex h-dvh w-full flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--card)] shadow-xl lg:w-[28rem]"
              data-chat-panel=""
              onInteractOutside={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => {
                if (trigger.current?.isConnected) {
                  event.preventDefault();
                  trigger.current.focus();
                }
              }}
            >
              <Dialog.Title className="sr-only">
                {active.title ||
                  (active.kind === "request" ? "Request chat" : "Direct chat")}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Read and reply to this conversation.
              </Dialog.Description>
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="lg:hidden"
                  >
                    <ArrowLeft size={15} aria-hidden />{" "}
                    {active.kind === "request"
                      ? "Back to requests"
                      : "Back to chats"}
                  </Button>
                </Dialog.Close>
                <span className="hidden text-xs font-semibold uppercase tracking-wide text-[var(--muted)] lg:inline">
                  {active.kind === "request" ? "Request chat" : "Direct chat"}
                </span>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close chat"
                  >
                    <X size={19} aria-hidden />
                  </Button>
                </Dialog.Close>
              </div>
              <ChatThread
                key={`${active.kind}:${active.threadId}`}
                target={active}
                open={open}
              />
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </ChatContext.Provider>
  );
}

export function useChat() {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("Chat controls require ChatHost.");
  return chat;
}
