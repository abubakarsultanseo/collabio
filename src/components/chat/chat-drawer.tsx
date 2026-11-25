"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Ellipsis,
  MessageSquare,
  Minus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatContext, type ChatTarget } from "@/components/chat/chat-context";
import MessagesWorkspace from "@/components/messages-workspace";

export { useChat, type ChatTarget } from "@/components/chat/chat-context";

type Point = { x: number; y: number };
type Drag = { pointer: number; offset: Point; width: number; height: number };
const gap = 16;
const positionKey = "collabio-chat-position";

function keepOnScreen(point: Point, width: number, height: number): Point {
  return {
    x: Math.max(gap, Math.min(point.x, window.innerWidth - width - gap)),
    y: Math.max(gap, Math.min(point.y, window.innerHeight - height - gap)),
  };
}

export function ChatHost({
  children,
  isAdmin,
}: {
  children: ReactNode;
  isAdmin: boolean;
}) {
  const [active, setActive] = useState<ChatTarget | null>(null);
  const [contacts, setContacts] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const positionRef = useRef<Point | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drafts = useRef(new Map<string, string>());
  const drag = useRef<Drag | null>(null);
  const openPanel = !minimized && (!!active || contacts);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(positionKey) ?? "null",
      ) as Point | null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        positionRef.current = saved;
        setPosition(saved);
      }
    } catch {
      /* start in the default position */
    }
  }, []);

  useEffect(() => {
    if (!openPanel || mobile || !panel.current) return;
    const element = panel.current;
    function clamp() {
      if (!positionRef.current) return;
      const bounds = element.getBoundingClientRect();
      const next = keepOnScreen(
        positionRef.current,
        bounds.width,
        bounds.height,
      );
      positionRef.current = next;
      setPosition(next);
    }
    const observer = new ResizeObserver(clamp);
    observer.observe(element);
    window.addEventListener("resize", clamp);
    clamp();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", clamp);
    };
  }, [openPanel, mobile]);

  function rememberTrigger() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && !focused.closest("[data-chat-panel]"))
      trigger.current = focused;
  }

  const open = useCallback((target: ChatTarget) => {
    rememberTrigger();
    setActive(target);
    setContacts(false);
    setMinimized(false);
  }, []);

  function launch() {
    rememberTrigger();
    if (minimized) {
      setMinimized(false);
      return;
    }
    setActive(null);
    setContacts(true);
  }

  function close() {
    setActive(null);
    setContacts(false);
    setMinimized(false);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    if (mobile || event.button !== 0 || !panel.current) return;
    const bounds = panel.current.getBoundingClientRect();
    drag.current = {
      pointer: event.pointerId,
      width: bounds.width,
      height: bounds.height,
      offset: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const next = keepOnScreen(
      {
        x: event.clientX - current.offset.x,
        y: event.clientY - current.offset.y,
      },
      current.width,
      current.height,
    );
    positionRef.current = next;
    setPosition(next);
  }

  function finishDrag() {
    drag.current = null;
    if (positionRef.current) {
      try {
        localStorage.setItem(positionKey, JSON.stringify(positionRef.current));
      } catch {
        /* position remains available in memory */
      }
    }
  }

  function resetPosition() {
    positionRef.current = null;
    setPosition(null);
    try {
      localStorage.removeItem(positionKey);
    } catch {
      /* position already reset */
    }
  }

  const key = active && `${active.kind}:${active.threadId}`;
  return (
    <ChatContext.Provider value={{ open, active }}>
      {children}
      {(!openPanel || active?.kind === "request") && (
        <Button
          type="button"
          onClick={launch}
          className="fixed bottom-20 right-4 z-30 h-11 rounded-full px-5 shadow-lg lg:bottom-5"
          aria-label={minimized ? "Restore chat" : "Open direct chat"}
        >
          <MessageSquare size={17} aria-hidden />{" "}
          {minimized ? "Restore chat" : "Chat"}
        </Button>
      )}
      <Dialog.Root
        open={openPanel}
        modal={mobile}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        {openPanel && (
          <Dialog.Portal>
            <Dialog.Content
              ref={panel}
              data-chat-panel=""
              onInteractOutside={(event) => event.preventDefault()}
              style={
                !mobile && position
                  ? {
                      left: position.x,
                      top: position.y,
                      right: "auto",
                      bottom: "auto",
                    }
                  : undefined
              }
              onCloseAutoFocus={(event) => {
                if (trigger.current?.isConnected) {
                  event.preventDefault();
                  trigger.current.focus();
                }
              }}
              className="fixed bottom-4 right-4 z-40 flex h-[min(40rem,calc(100dvh-2rem))] w-[min(27rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
            >
              <Dialog.Title className="sr-only">
                {active?.title ||
                  (active?.kind === "request" ? "Request chat" : "Direct chat")}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Read and reply to messages.
              </Dialog.Description>
              <div className="relative flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-1">
                  {isAdmin && active?.kind === "direct" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Back to chats"
                      onClick={launch}
                    >
                      <ArrowLeft size={16} aria-hidden />
                    </Button>
                  )}
                  <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {active?.kind === "request"
                      ? "Request chat"
                      : "Direct chat"}
                  </span>
                </div>
                <div className="flex items-center">
                  {active?.kind === "request" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Open direct chat"
                      title="Open direct chat"
                      onClick={launch}
                    >
                      <MessageSquare size={16} aria-hidden />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Drag chat window"
                    title="Drag to move"
                    className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab active:cursor-grabbing md:inline-flex"
                    onPointerDown={beginDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    onLostPointerCapture={finishDrag}
                    onDoubleClick={resetPosition}
                    onKeyDown={(event) => {
                      if (!panel.current) return;
                      const offsets: Record<string, Point> = {
                        ArrowLeft: { x: -20, y: 0 },
                        ArrowRight: { x: 20, y: 0 },
                        ArrowUp: { x: 0, y: -20 },
                        ArrowDown: { x: 0, y: 20 },
                      };
                      const offset = offsets[event.key];
                      if (!offset) return;
                      event.preventDefault();
                      const bounds = panel.current.getBoundingClientRect();
                      const next = keepOnScreen(
                        { x: bounds.left + offset.x, y: bounds.top + offset.y },
                        bounds.width,
                        bounds.height,
                      );
                      positionRef.current = next;
                      setPosition(next);
                      finishDrag();
                    }}
                  >
                    <Ellipsis size={20} aria-hidden />
                  </Button>
                  {position && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="hidden md:inline-flex"
                      title="Reset position"
                      aria-label="Reset chat position"
                      onClick={resetPosition}
                    >
                      <RotateCcw size={15} aria-hidden />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Minimize chat"
                    onClick={() => setMinimized(true)}
                  >
                    <Minus size={17} aria-hidden />
                  </Button>
                  <Dialog.Close asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Close chat"
                    >
                      <X size={18} aria-hidden />
                    </Button>
                  </Dialog.Close>
                </div>
              </div>
              {active && key ? (
                <ChatThread
                  key={key}
                  target={active}
                  open={open}
                  initialDraft={drafts.current.get(key) ?? ""}
                  onDraft={(text) => {
                    if (text) drafts.current.set(key, text);
                    else drafts.current.delete(key);
                  }}
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <MessagesWorkspace compact />
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </ChatContext.Provider>
  );
}
