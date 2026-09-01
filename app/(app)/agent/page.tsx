"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { LoadingState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import type { AgentRunStep, Conversation, ConversationMessage } from "@/lib/types";

interface AgentMessageResponse {
  conversationId: string;
  runId: string;
  message: ConversationMessage;
  pendingApproval: { actionId: string } | null;
  steps: AgentRunStep[];
}

const SUGGESTIONS = [
  "I've been struggling to stay consistent with my exercise routine.",
  "What's my next session?",
  "How has my progress been this week?",
];

let localIdCounter = 0;
function nextLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

export default function AgentPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [stepsByMessageId, setStepsByMessageId] = useState<Record<string, AgentRunStep[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadLatestConversation() {
      try {
        const { conversations } = await api.get<{ conversations: Conversation[] }>("/api/agent/conversations");
        if (conversations.length > 0 && !cancelled) {
          const latest = conversations[0];
          const { messages: history } = await api.get<{ messages: ConversationMessage[] }>(`/api/agent/conversations/${latest.id}`);
          if (!cancelled) {
            setConversationId(latest.id);
            setMessages(history);
          }
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    loadLatestConversation();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const optimisticUser: ConversationMessage = {
      id: nextLocalId("local"),
      conversationId: conversationId ?? "",
      role: "user",
      content: trimmed,
      cards: [],
      createdAt: new Date().toISOString(),
      metadata: {},
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    setSending(true);

    try {
      const res = await api.post<AgentMessageResponse>("/api/agent/message", { message: trimmed, conversationId: conversationId ?? undefined });
      setConversationId(res.conversationId);
      setMessages((prev) => [...prev, res.message]);
      setStepsByMessageId((prev) => ({ ...prev, [res.message.id]: res.steps }));
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextLocalId("error"),
          conversationId: conversationId ?? "",
          role: "agent",
          content: "I couldn't complete that just now. Nothing was changed — please try again.",
          cards: [],
          createdAt: new Date().toISOString(),
          metadata: {},
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (initializing) return <LoadingState label="Loading your conversation…" />;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:h-[calc(100vh-4rem)]">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Tell Continuum what&apos;s on your mind — a routine you&apos;re struggling with, a question about your plan, or how things have been going.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <AgentMessage key={m.id} message={m} steps={stepsByMessageId[m.id]} />
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Understanding your request…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-3 flex items-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="agent-message" className="sr-only">
          Message Continuum
        </label>
        <textarea
          id="agent-message"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Message Continuum…"
          className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
        />
        <Button type="submit" disabled={sending || input.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
