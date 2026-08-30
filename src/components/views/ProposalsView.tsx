"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptProposal, dismissProposal } from "@/app/actions/engine";
import { formatEur } from "@/lib/agents/costs";
import type { AgentFull, Connector, TaskProposal, Verdict } from "@/lib/types";

const VERDICT: Record<Verdict, { label: string; bg: string; fg: string }> = {
  worth: { label: "oplatí sa", bg: "var(--accent-soft)", fg: "var(--accent)" },
  borderline: { label: "hraničné", bg: "#fff5e0", fg: "#8a5b00" },
  not_worth: { label: "neoplatí sa", bg: "var(--red-soft)", fg: "var(--red)" },
};

export default function ProposalsView({
  proposals, agents, connectors,
}: {
  proposals: TaskProposal[]; agents: AgentFull[]; connectors: Connector[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const agentById = new Map(agents.map((a) => [a.id, a]));
  const connectedKeys = new Set(connectors.filter((c) => c.status === "connected").map((c) => c.key));

  const open = proposals.filter((p) => p.status === "proposed");
  const blocked = proposals.filter((p) => p.status === "blocked");

  async function handleAccept(id: string) {
    setBusyId(id); setError(null);
    try {
      const outcome = await acceptProposal(id);
      if (outcome.status === "failed") setError(outcome.output);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  }

  const card = (p: TaskProposal) => {
    const v = VERDICT[p.verdict];
    const agent = agentById.get(p.agent_id);
    const missing = p.requires_tools.filter((t) => !connectedKeys.has(t));
    const busy = busyId === p.id;

    return (
      <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: 14 }}>{p.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
              navrhol {agent?.name ?? "agent"} · {new Date(p.created_at).toLocaleString("sk-SK")}
            </div>
          </div>
          <span className="pill" style={{ background: v.bg, color: v.fg }}>{v.label}</span>
        </div>

        {p.rationale && (
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
            <b style={{ color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Prečo nasleduje</b>
            <div>{p.rationale}</div>
          </div>
        )}
        {p.expected_outcome && (
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
            <b style={{ color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Čo z toho budeš mať</b>
            <div>{p.expected_outcome}</div>
          </div>
        )}

        {/* the economics — always visible, this is the point */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, background: "var(--bg-sunken)", padding: "8px 10px", borderRadius: 8 }}>
          <span>Dopad <b>{p.impact}/5</b></span>
          <span>Námaha <b>{p.effort}/5</b></span>
          <span>~{p.est_tokens.toLocaleString("sk-SK")} tokenov</span>
          <span>≈ <b>{formatEur(Number(p.est_cost_eur))}</b></span>
        </div>
        {p.verdict_reason && (
          <div style={{ fontSize: 12.2, color: v.fg }}>{p.verdict_reason}</div>
        )}
        {missing.length > 0 && (
          <div className="note warn" style={{ marginTop: 0 }}>
            <span>Potrebuje napojenie: <b>{missing.join(", ")}</b>. Agent to vie len pripraviť a nahlási, čo chýba.</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-primary" disabled={busy || pending} onClick={() => handleAccept(p.id)}>
            {busy ? "Pracuje…" : "Spustiť tento krok"}
          </button>
          <button className="ghost" disabled={busy || pending} onClick={() => startTransition(() => dismissProposal(p.id))}>
            Zahodiť
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="note info" style={{ marginTop: 0 }}>
        <span>
          Každý agent po dokončení kroku navrhne <b>dva ďalšie</b> — jeden na sledovanie výsledku, jeden na rozvinutie.
          Pri každom ti ukáže odhad tokenov, cenu a verdikt, či sa to oplatí.
        </span>
      </div>

      <div className="sec-title">Čaká na tvoje rozhodnutie</div>
      {error && <div className="note warn"><span>{error}</span></div>}
      {open.length === 0 ? (
        <div className="note info"><span>Žiadne otvorené návrhy. Spusti agenta v sekcii Agents a návrhy sa objavia tu.</span></div>
      ) : (
        <div className="grid" style={{ gap: 14 }}>{open.map(card)}</div>
      )}

      {blocked.length > 0 && (
        <>
          <div className="sec-title">Čaká na napojenie kanála</div>
          <div className="grid" style={{ gap: 14 }}>{blocked.map(card)}</div>
        </>
      )}
    </div>
  );
}
