"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateAgentFromPrompt, toggleAgentStatus } from "@/app/actions/agents";
import {
  runAgentNow, toggleAutopilot, setAgentBudget, setAgentGoal, resetAgentHealth,
} from "@/app/actions/engine";
import { formatEur } from "@/lib/agents/costs";
import type { AgentFull, AgentKind, Connector, RunFull, RunStep } from "@/lib/types";

const KIND_LABEL: Record<AgentKind, string> = {
  sales: "Sales", ads: "Ads", marketing: "Marketing", support: "Support",
};

const HEALTH: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  working: { label: "pracuje", bg: "var(--accent-soft)", fg: "var(--accent)", dot: "#0c6f63" },
  idle: { label: "čaká na zadanie", bg: "var(--line-soft)", fg: "var(--ink-3)", dot: "#848b97" },
  blocked: { label: "zablokovaný", bg: "#fff5e0", fg: "#8a5b00", dot: "#e2960c" },
  error: { label: "chyba", bg: "var(--red-soft)", fg: "var(--red)", dot: "#c0392b" },
};

export default function AgentsView({
  agents, runs, steps, connectors,
}: {
  agents: AgentFull[]; runs: RunFull[]; steps: RunStep[]; connectors: Connector[];
}) {
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<Record<string, string[]>>({});
  const router = useRouter();

  const connectedKeys = new Set(connectors.filter((c) => c.status === "connected").map((c) => c.key));
  const connectorByKey = new Map(connectors.map((c) => [c.key, c]));

  function handleGenerate() {
    if (!prompt.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await generateAgentFromPrompt(prompt);
        setPrompt("");
      } catch (e) { setError(msg(e)); }
    });
  }

  async function handleRun(agentId: string) {
    setBusyId(agentId); setError(null);
    try {
      const outcome = await runAgentNow(agentId);
      if (outcome.status === "failed") setError(outcome.output);
      router.refresh();
    } catch (e) { setError(msg(e)); } finally { setBusyId(null); }
  }

  /**
   * Unlimited continuation: keeps calling the autopilot endpoint, one real step
   * at a time, until the agent itself decides to stop (budget, not worth it,
   * missing connector, or nothing left to do).
   */
  async function handleAutopilotRun(agentId: string) {
    setBusyId(agentId); setError(null);
    setAutoLog((l) => ({ ...l, [agentId]: ["Autopilot spustený…"] }));
    try {
      for (let i = 0; i < 25; i++) {
        const res = await fetch("/api/autopilot", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Autopilot zlyhal.");
        if (data.step) {
          setAutoLog((l) => ({
            ...l,
            [agentId]: [...(l[agentId] ?? []), `✓ ${data.step.title} · ${data.step.cost}`],
          }));
          router.refresh();
        }
        if (data.done) {
          setAutoLog((l) => ({
            ...l,
            [agentId]: [...(l[agentId] ?? []), `■ Zastavené: ${data.stopReason ?? "hotovo"}`],
          }));
          break;
        }
      }
    } catch (e) {
      setAutoLog((l) => ({ ...l, [agentId]: [...(l[agentId] ?? []), `✕ ${msg(e)}`] }));
    } finally { setBusyId(null); router.refresh(); }
  }

  return (
    <div>
      <div className="hero hero-tight">
        <div className="hero-top">
          <h2>Riadiaca miestnosť. <span>Vidíš, čo agenti naozaj robia.</span></h2>
          <p className="lead">Popíš, čo má nový agent robiť — Claude z toho vytvorí funkčnú definíciu.</p>
        </div>
        <div className="card" style={{ padding: 16, textAlign: "left" }}>
          <textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
            style={{ width: "100%", border: "1px solid #e2e5ea", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, resize: "vertical" }}
            placeholder="napr. Sleduj kontakty bez obchodu, dohľadaj si o firme informácie a priprav osobné oslovenie…"
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Čím konkrétnejšie, tým menej doladzovania.</span>
            <button className="btn-primary" disabled={!prompt.trim() || pending} onClick={handleGenerate}>
              <svg style={{ width: 14, height: 14 }}><use href="#i-spark" /></svg>
              {pending ? "Generujem…" : "Vytvoriť agenta"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="note warn" style={{ maxWidth: 760, margin: "16px auto" }}><span>{error}</span></div>}

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="sec-title">Tvoji agenti</div>

        {agents.length === 0 ? (
          <div className="note info"><span>Zatiaľ nemáš žiadneho agenta. Napíš vyššie, čo má robiť.</span></div>
        ) : (
          <div className="grid" style={{ gap: 14 }}>
            {agents.map((a) => {
              const h = HEALTH[a.health] ?? HEALTH.idle;
              const agentRuns = runs.filter((r) => r.agent_id === a.id);
              const lastRun = agentRuns[0];
              const lastSteps = lastRun ? steps.filter((s) => s.run_id === lastRun.id) : [];
              const missing = (a.required_tools ?? []).filter((t) => !connectedKeys.has(t));
              const budgetPct = Math.min(100, Math.round((a.tokens_used / Math.max(1, a.token_budget)) * 100));
              const isOpen = openId === a.id;
              const busy = busyId === a.id;
              const log = autoLog[a.id] ?? [];

              return (
                <div key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* --- header: who + live state --- */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", background: h.dot, flex: "none",
                          animation: a.health === "working" ? "pulse 1.4s ease-in-out infinite" : undefined,
                        }} />
                        <span style={{ fontWeight: 650, fontSize: 14.5 }}>{a.name}</span>
                        <span className="pill" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          {KIND_LABEL[a.kind]}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: h.fg, marginTop: 3 }}>
                        {a.health === "working" && a.current_activity
                          ? `Práve robí: ${a.current_activity}`
                          : h.label}
                        {a.last_run_at && a.health !== "working" && (
                          <span style={{ color: "var(--ink-3)" }}>
                            {" "}· naposledy {new Date(a.last_run_at).toLocaleString("sk-SK")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="pill" style={{ background: h.bg, color: h.fg }}>{h.label}</span>
                  </div>

                  {/* --- why it is not working + how to start it --- */}
                  {(a.health === "blocked" || a.health === "error") && (
                    <div className="note warn" style={{ marginTop: 0 }}>
                      <span>
                        <b>{a.last_error ?? "Agent sa zastavil."}</b>
                        {a.last_error_hint ? <> — {a.last_error_hint}</> : null}
                      </span>
                    </div>
                  )}
                  {a.health === "idle" && !lastRun && (
                    <div className="note info" style={{ marginTop: 0 }}>
                      <span>Agent zatiaľ nič nespustil. Klikni <b>Spustiť teraz</b> — urobí prvý reálny krok a sám navrhne dva ďalšie.</span>
                    </div>
                  )}
                  {missing.length > 0 && (
                    <div className="note warn" style={{ marginTop: 0 }}>
                      <span>
                        Chýba napojenie: <b>{missing.join(", ")}</b>.{" "}
                        {missing.map((k) => connectorByKey.get(k)?.detail).filter(Boolean).join(" ")}
                      </span>
                    </div>
                  )}

                  {/* --- live step timeline of the most recent run --- */}
                  {lastSteps.length > 0 && (
                    <div style={{ borderLeft: "2px solid var(--line)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                      {lastSteps.slice(0, 8).map((s) => (
                        <div key={s.id} style={{ fontSize: 12.2, color: s.status === "blocked" ? "#8a5b00" : s.status === "failed" ? "var(--red)" : "var(--ink-2)" }}>
                          {s.status === "done" ? "✓" : s.status === "running" ? "◔" : s.status === "blocked" ? "▲" : "✕"} {s.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* --- autopilot live log --- */}
                  {log.length > 0 && (
                    <div style={{ background: "var(--bg-sunken)", borderRadius: 8, padding: 10, fontSize: 12.2, display: "flex", flexDirection: "column", gap: 3 }}>
                      {log.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  )}

                  {/* --- budget --- */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink-3)" }}>
                      <span>Rozpočet tokenov</span>
                      <span>{a.tokens_used.toLocaleString("sk-SK")} / {a.token_budget.toLocaleString("sk-SK")} · minuté {formatEur(Number(a.cost_eur))}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--line-soft)", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${budgetPct}%`, height: "100%", background: budgetPct > 85 ? "var(--red)" : "var(--accent-2)" }} />
                    </div>
                  </div>

                  {/* --- controls --- */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn-primary" disabled={busy || a.health === "working"} onClick={() => handleRun(a.id)}>
                      {busy ? "Pracuje…" : "Spustiť teraz"}
                    </button>
                    <button
                      className="ghost" disabled={busy || !a.autopilot}
                      title={a.autopilot ? "Agent pokračuje krok za krokom, kým sa mu to oplatí" : "Najprv zapni autopilota"}
                      onClick={() => handleAutopilotRun(a.id)}
                    >
                      ▸ Nechať bežať ďalej
                    </button>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.2, color: "var(--ink-2)" }}>
                      <input
                        type="checkbox" checked={a.autopilot}
                        onChange={(e) => startTransition(() => toggleAutopilot(a.id, e.target.checked))}
                      />
                      Autopilot
                    </label>
                    <button className="ghost" onClick={() => setOpenId(isOpen ? null : a.id)}>
                      {isOpen ? "Skryť nastavenia" : "Nastavenia"}
                    </button>
                    {(a.health === "error" || a.health === "working") && (
                      <button className="ghost" onClick={() => startTransition(() => resetAgentHealth(a.id))}>
                        Reset stavu
                      </button>
                    )}
                    <button
                      className="ghost"
                      onClick={() => startTransition(() => toggleAgentStatus(a.id, a.status === "active" ? "paused" : "active"))}
                    >
                      {a.status === "active" ? "Pozastaviť" : "Aktivovať"}
                    </button>
                  </div>

                  {isOpen && <AgentSettings agent={a} connectors={connectors} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
    </div>
  );
}

function AgentSettings({ agent, connectors }: { agent: AgentFull; connectors: Connector[] }) {
  const [goal, setGoal] = useState(agent.goal ?? "");
  const [tools, setTools] = useState<string[]>(agent.required_tools ?? []);
  const [budget, setBudget] = useState(agent.token_budget);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="if-grid" style={{ gridTemplateColumns: "1fr" }}>
        <label>
          Dlhodobý cieľ agenta
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="napr. Držať pipeline plný kvalifikovaných leadov z SK/CZ" />
        </label>
        <label>
          Tokenový rozpočet
          <input type="number" value={budget} min={10000} step={50000} onChange={(e) => setBudget(Number(e.target.value))} />
        </label>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
          Nástroje, ktoré agent potrebuje
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {connectors.map((c) => {
            const on = tools.includes(c.key);
            const ok = c.status === "connected";
            return (
              <button
                key={c.key} type="button"
                onClick={() => setTools((t) => (on ? t.filter((x) => x !== c.key) : [...t, c.key]))}
                className="pill"
                style={{
                  cursor: "pointer",
                  background: on ? (ok ? "var(--accent-soft)" : "#fff5e0") : "var(--line-soft)",
                  color: on ? (ok ? "var(--accent)" : "#8a5b00") : "var(--ink-3)",
                  border: "none",
                }}
                title={c.detail ?? ""}
              >
                {ok ? "●" : "○"} {c.key}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>
          ● = napojené a agent to naozaj vie použiť · ○ = nenapojené, agent to vie len pripraviť a nahlási to
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn-primary" disabled={pending}
          onClick={() => startTransition(async () => {
            await setAgentGoal(agent.id, goal, tools);
            await setAgentBudget(agent.id, budget);
            setSaved(true);
          })}
        >
          {pending ? "Ukladám…" : "Uložiť"}
        </button>
        {saved && <span style={{ fontSize: 12.5, color: "var(--accent)" }}>Uložené.</span>}
      </div>
    </div>
  );
}

function msg(e: unknown) { return e instanceof Error ? e.message : String(e); }
