"use client";

import { createContext, useContext } from "react";

export type ChatTarget = {
  kind: "request" | "direct";
  threadId: string;
  title?: string;
  avatarUrl?: string | null;
  requestInfo?: { code?: number; status?: string; partnerName?: string };
  onRead?: (id: string) => void;
  nextUnread?: () => ChatTarget | undefined;
};

type ChatControls = {
  open: (target: ChatTarget) => void;
  active: ChatTarget | null;
};
export const ChatContext = createContext<ChatControls | null>(null);

export function useChat() {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("Chat controls require ChatHost.");
  return chat;
}
