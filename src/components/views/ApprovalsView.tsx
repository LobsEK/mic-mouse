"use client";

import { useTransition } from "react";
import { decideAgentRun } from "@/app/actions/agents";
import { formatEur } from "@/lib/agents/costs";
import type { AgentFull, Contact, RunFull, RunStep } from "@/lib/types";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  running: { label: "beží…", bg: "var(--accent-soft)", fg: "var(--accent)" },
  pending: { label: "beží…", bg: "var(--line-soft)", fg: "var(--ink-3)" },
  needs_approval: { label: "čaká na teba", bg: "#fff5e0", fg: "#8a5b00" },
  approved: { label: "schválené", bg: "var(--accent-soft)", fg: "var(--accent)" },
  rejected: { label: "zamietnuté", bg: "var(--red-soft)", fg: "var(--red)" },
  failed: { label: "zlyhalo", bg: "var(--red-soft)", fg: "var(--red)" },
  blocked: { label: "zablokované", bg: "#fff5e0", fg: "#8a5b00" },
  done: { label: "hotovo", bg: "var(--accent-soft)", fg: "var(--accent)" },
};

export default function ApprovalsView({
  runs, contacts, agents, steps,
}: {
  runs: RunFull[]; contacts: Contact[]; agents: AgentFull[]; steps: RunStep[];
}) {
  const [pending, startTransition] = useTransition();
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const waiting = runs.filter((r) => ["needs_approval", "running", "pending", "blocked"].includes(r.status));
  const history = runs.filter((r) => ["approved", "rejected", "failed", "done"].includes(r.status));
  const totalCost = runs.reduce((s, r) => s + Number(r.cost_eur || 0), 0);

  return (
    <div>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="lbl">Čaká na teba</div>
          <div className="val">{runs.filter((r) => r.status === "needs_approval").length}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Práve beží</div>
          <div className="val">{runs.filter((r) => r.status === "running").length}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Zablokované</div>
          <div className="val">{runs.filter((r) => r.status === "blocked").length}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Minuté spolu</div>
          <div className="val" style={{ fontSize: 20 }}>{formatEur(totalCost)}</div>
        </div>
      </div>

      <div className="sec-title">Čaká na rozhodnutie</div>
      {waiting.length === 0 ? (
        <div className="note info"><span>Nič nečaká. Výstupy agentov sa objavia tu.</span></div>
      ) : (
        <div className="grid" style={{ maxWidth: 800, gap: 14 }}>
          {waiting.map((r) => {
            const st = STATUS[r.status] ?? STATUS.pending;
            const contact = r.contact_id ? contactById.get(r.contact_id) : null;
            const agent = agentById.get(r.agent_id);
            const mySteps = steps.filter((s) => s.run_id === r.id);
            const draft = mySteps.find((s) => s.step_no === 99)?.detail;

            return (
              <div key={r.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 650 }}>{r.title ?? agent?.name ?? "Beh agenta"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                      {agent?.name ?? "Agent"}{contact ? ` → ${contact.name}` : ""} · {formatEur(Number(r.cost_eur))}
                      {r.input_tokens + r.output_tokens > 0 && ` · ${(r.input_tokens + r.output_tokens).toLocaleString("sk-SK")} tokenov`}
                    </div>
                  </div>
                  <span className="pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                </div>

                {mySteps.length > 0 && (
                  <div style={{ borderLeft: "2px solid var(--line)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                    {mySteps.filter((s) => s.step_no < 98).map((s) => (
                      <div key={s.id} style={{ fontSize: 12.2, color: "var(--ink-2)" }}>
                        {s.status === "done" ? "✓" : s.status === "running" ? "◔" : s.status === "blocked" ? "▲" : "✕"} {s.label}
                      </div>
                    ))}
                  </div>
                )}

                {r.blocked_reason && (
                  <div className="note warn" style={{ marginTop: 0 }}>
                    <span><b>Zastavené — chýba napojenie.</b> {r.blocked_reason}</span>
                  </div>
                )}

                {(draft || r.output) && (
                  <pre style={{
                    whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13,
                    background: "var(--bg-sunken)", padding: 12, borderRadius: 8, margin: 0,
                  }}>{draft ?? r.output}</pre>
                )}

                {r.status === "needs_approval" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" disabled={pending}
                      onClick={() => startTransition(() => decideAgentRun(r.id, "approved"))}>
                      Schváliť
                    </button>
                    <button className="ghost" disabled={pending}
                      onClick={() => startTransition(() => decideAgentRun(r.id, "rejected"))}>
                      Zamietnuť
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="sec-title">História behov</div>
          <div className="card" style={{ padding: 0, overflow: "hidden", maxWidth: 800 }}>
            <table>
              <thead>
                <tr><th>Krok</th><th>Agent</th><th>Výsledok</th><th>Cena</th><th>Kedy</th></tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const st = STATUS[r.status] ?? STATUS.done;
                  const agent = agentById.get(r.agent_id);
                  return (
                    <tr key={r.id}>
                      <td>{r.title ?? "—"}</td>
                      <td>{agent?.name ?? "Agent"}</td>
                      <td><span className="pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span></td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{formatEur(Number(r.cost_eur))}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{new Date(r.created_at).toLocaleString("sk-SK")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
