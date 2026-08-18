"use client";

import { useRef, useState } from "react";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
}

const SUGGESTIONS = [
  "How is the department doing this month?",
  "Give me a payroll report for the latest period.",
  "Which trainers had the most completed sessions?",
  "How fresh is our data right now?",
];

export function DirectorChat({ organizationId }: { organizationId: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function ask(question: string) {
    if (pending || question.trim() === "") return;
    setError(null);
    setPending(true);
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    try {
      const response = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          conversationId: conversationRef.current,
          question,
        }),
      });
      const body = (await response.json()) as {
        conversationId?: string;
        answer?: string;
        toolCalls?: string[];
        error?: string;
      };
      if (!response.ok || !body.answer) {
        setError(body.error ?? "The Director hit an error — try again.");
      } else {
        conversationRef.current = body.conversationId ?? conversationRef.current;
        setTurns((t) => [
          ...t,
          { role: "assistant", content: body.answer!, toolCalls: body.toolCalls },
        ]);
      }
    } catch {
      setError("Could not reach the Director — check your connection and try again.");
    } finally {
      setPending(false);
      queueMicrotask(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      );
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-[--radius-card] border border-border bg-surface shadow-sm">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Ask about production, revenue, payroll, clients, or data health. Every
              answer states which data it is based on and how current that data is.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-full border border-border bg-surface-sunken px-3 py-1.5 text-xs text-ink hover:border-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "flex justify-end" : "flex"}>
            <div
              className={
                turn.role === "user"
                  ? "max-w-[85%] rounded-[--radius-card] bg-accent px-3 py-2 text-sm text-white"
                  : "max-w-[85%] rounded-[--radius-card] bg-surface-sunken px-3 py-2 text-sm text-ink"
              }
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.toolCalls && turn.toolCalls.length > 0 && (
                <p className="mt-2 text-[11px] text-ink-muted">
                  Evidence: {[...new Set(turn.toolCalls)].join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <p className="text-sm text-ink-muted">Checking the data…</p>
        )}
        {error && (
          <p role="alert" className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative">
            {error}
          </p>
        )}
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the Director…"
          disabled={pending}
          className="h-10 flex-1 rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending || input.trim() === ""}
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
