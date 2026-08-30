"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ApolloOrb, { type OrbState } from "@/components/ApolloOrb";
import ApolloComposer from "@/components/ApolloComposer";
import { getBriefing, type BriefingResult } from "@/app/actions/briefing";
import { markEventsSeen } from "@/app/actions/engine";
import type { AgentEvent, ChatMessage } from "@/lib/types";

export default function Apollo({
  events, onGoToAgents,
}: {
  events: AgentEvent[]; onGoToAgents: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const unseenErrors = events.filter((e) => !e.seen_at && e.level === "error").length;
  const unseenWarns = events.filter((e) => !e.seen_at && e.level === "warn").length;
  const badge = unseenErrors + unseenWarns;

  /** When you come back, Apollo reports in by itself — that is the point. */
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    setBriefingLoading(true);
    getBriefing()
      .then((b) => {
        setBriefing(b);
        setMessages([{ role: "assistant", content: b.content }]);
      })
      .catch((e) => {
        setMessages([{
          role: "assistant",
          content: `Nepodarilo sa mi načítať stav agentov: ${e instanceof Error ? e.message : String(e)}`,
        }]);
      })
      .finally(() => setBriefingLoading(false));
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/apollo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Apollo zlyhal.");
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "…" }]);
      if (data.actions?.length) router.refresh();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Chyba: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }));
    }
  }

  const problems = briefing?.problems ?? [];
  const showBanner = !dismissed && !open && briefing && (problems.length > 0 || (briefing.stats.approvals + briefing.stats.proposals) > 0);

  // The orb's eyes tell you what Apollo is doing before you read a single word.
  const orbState: OrbState =
    sending || briefingLoading ? "thinking"
    : (briefing?.stats.working ?? 0) > 0 ? "working"
    : unseenErrors > 0 || (briefing?.stats.blocked ?? 0) + (briefing?.stats.errored ?? 0) > 0 ? "alert"
    : "idle";

  return (
    <>
      {/* --- Apollo speaks up on its own when something needs you --- */}
      {showBanner && (
        <div style={{
          position: "fixed", right: 20, bottom: 92, zIndex: 199, width: 360, maxWidth: "calc(100vw - 40px)",
          background: "#fff", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--sh-lg)", padding: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <ApolloOrb size={22} state={orbState} follow={false} />
              <b style={{ fontSize: 12.5 }}>Apollo hlási</b>
            </span>
            <button className="icon-btn" onClick={() => setDismissed(true)} title="Skryť">
              <svg fill="none" stroke="currentColor" strokeWidth={2.1} viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{briefing.content}</div>
          {problems.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
              {problems.slice(0, 3).map((p, i) => (
                <div key={i} style={{ fontSize: 12, background: "#fff5e0", color: "#8a5b00", padding: "6px 8px", borderRadius: 7 }}>
                  <b>{p.agent}</b> — {p.problem}
                  {p.hint && <div style={{ opacity: 0.85 }}>{p.hint}</div>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn-primary btn-inline" style={{ fontSize: 12 }} onClick={() => { onGoToAgents(); setDismissed(true); }}>
              Ukáž agentov
            </button>
            <button className="ghost" style={{ fontSize: 12 }} onClick={() => setOpen(true)}>Otvoriť Apolla</button>
          </div>
        </div>
      )}

      {!open ? (
        <button
          onClick={() => { setOpen(true); setDismissed(true); if (badge) markEventsSeen(); }}
          title={
            orbState === "working" ? "Apollo: agenti pracujú"
            : orbState === "thinking" ? "Apollo premýšľa…"
            : orbState === "alert" ? "Apollo: niečo si žiada tvoju pozornosť"
            : "Apollo"
          }
          style={{
            position: "fixed", right: 22, bottom: 22, zIndex: 200, borderRadius: "50%",
            background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0,
          }}
        >
          <ApolloOrb size={64} state={orbState} />
          {badge > 0 && (
            <span style={{
              position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10,
              background: unseenErrors ? "#c0392b" : "#e2960c", color: "#fff", fontSize: 11, fontWeight: 700,
              display: "grid", placeItems: "center", padding: "0 5px",
            }}>{badge}</span>
          )}
        </button>
      ) : (
        <div style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 200, width: 400, maxWidth: "calc(100vw - 40px)",
          height: 560, maxHeight: "calc(100vh - 40px)", background: "#fff", border: "1px solid var(--line)",
          borderRadius: 16, boxShadow: "var(--sh-lg)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 650 }}>
            <ApolloOrb size={26} state={orbState} />
            <span style={{ flex: 1 }}>Apollo</span>
            {briefing && (
              <span className="pill" style={{ background: "var(--line-soft)", color: "var(--ink-3)" }}>
                {briefing.stats.working} pracuje · {briefing.stats.blocked + briefing.stats.errored} problém
              </span>
            )}
            <button className="icon-btn" onClick={() => setOpen(false)} title="Zavrieť">
              <svg fill="none" stroke="currentColor" strokeWidth={2.1} viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {briefingLoading && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Zisťujem, čo agenti robili…</div>}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%",
                background: m.role === "user" ? "var(--ink)" : "var(--bg-sunken)",
                color: m.role === "user" ? "#fff" : "var(--ink)",
                borderRadius: 12, padding: "8px 11px", fontSize: 13.2, whiteSpace: "pre-wrap",
              }}>{m.content}</div>
            ))}
            {sending && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Apollo pracuje…</div>}

            {problems.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {problems.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, background: "#fff5e0", color: "#8a5b00", padding: "7px 9px", borderRadius: 8 }}>
                    <b>{p.agent}</b> — {p.problem}
                    {p.hint && <div style={{ opacity: 0.85, marginTop: 2 }}>{p.hint}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ApolloComposer
            value={input}
            onChange={setInput}
            onSend={send}
            sending={sending}
          />
        </div>
      )}
    </>
  );
}
