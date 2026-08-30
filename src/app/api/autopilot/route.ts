import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";
import { runAgentStep } from "@/lib/agents/engine";
import { formatEur } from "@/lib/agents/costs";
import type { AgentFull, TaskProposal } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ONE autopilot step per call. The browser calls this in a loop, so the chain
 * can run indefinitely without ever hitting a serverless timeout — and the user
 * watches each step land. The loop stops itself on: budget, a not-worth verdict,
 * a missing connector, or when there is nothing sensible left to do.
 */
export async function POST(req: Request) {
  const { userId } = await verifySession();
  const { agentId } = await req.json();
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: agentRow } = await supabase
    .from("agents").select("*").eq("id", agentId).eq("owner_id", userId).single();
  if (!agentRow) return NextResponse.json({ error: "Agent sa nenašiel." }, { status: 404 });
  const agent = agentRow as AgentFull;

  if (!agent.autopilot) {
    return NextResponse.json({ done: true, stopReason: "Autopilot je vypnutý." });
  }
  if (agent.tokens_used >= agent.token_budget) {
    return NextResponse.json({
      done: true,
      stopReason: `Vyčerpaný rozpočet (${agent.tokens_used.toLocaleString("sk-SK")} / ${agent.token_budget.toLocaleString("sk-SK")} tokenov). Zvýš ho, ak má pokračovať.`,
    });
  }

  const { data: proposals } = await supabase
    .from("task_proposals").select("*")
    .eq("owner_id", userId).eq("agent_id", agentId).eq("status", "proposed")
    .order("created_at", { ascending: true });

  const list = (proposals ?? []) as TaskProposal[];
  if (list.length === 0) {
    // Nothing proposed yet: do a first real step from the agent's own goal.
    const { data: anyRun } = await supabase
      .from("agent_runs").select("id").eq("agent_id", agentId).limit(1).maybeSingle();
    if (anyRun) {
      return NextResponse.json({ done: true, stopReason: "Nie sú žiadne otvorené návrhy ďalších krokov." });
    }
    const task = agent.goal?.trim()
      || (typeof agent.config?.instructions === "string" ? (agent.config.instructions as string) : "")
      || "Pozri stav CRM a urob najužitočnejší prvý krok vo svojej oblasti.";
    const outcome = await runAgentStep({
      userId, agentId, title: task.split("\n")[0].slice(0, 90), instruction: task, depth: 0,
    });
    return NextResponse.json({
      done: false, step: { title: task.split("\n")[0].slice(0, 90), status: outcome.status, cost: formatEur(outcome.costEur) },
    });
  }

  // Pick the best next step: worth first, then best impact-to-effort ratio.
  const rank = (p: TaskProposal) =>
    (p.verdict === "worth" ? 100 : p.verdict === "borderline" ? 50 : 0) + p.impact / Math.max(1, p.effort);
  const best = [...list].sort((a, b) => rank(b) - rank(a))[0];

  if (best.verdict === "not_worth") {
    await supabase.from("agent_events").insert({
      owner_id: userId, agent_id: agentId, level: "info",
      message: `${agent.name} zastavil autopilota: ďalší krok sa neoplatí.`,
      hint: best.verdict_reason,
    });
    return NextResponse.json({
      done: true,
      stopReason: `Zastavené z ekonomických dôvodov — ${best.verdict_reason ?? "ďalší krok sa neoplatí."}`,
    });
  }

  const budgetLeft = agent.token_budget - agent.tokens_used;
  if (best.est_tokens > budgetLeft) {
    return NextResponse.json({
      done: true,
      stopReason: `Ďalší krok potrebuje ~${best.est_tokens.toLocaleString("sk-SK")} tokenov, zostáva ${budgetLeft.toLocaleString("sk-SK")}. Zvýš rozpočet.`,
    });
  }
  if (best.verdict === "borderline" && budgetLeft < agent.token_budget * 0.35) {
    return NextResponse.json({
      done: true,
      stopReason: "Zostáva menej než tretina rozpočtu — hraničné kroky nechávam na tvoje rozhodnutie.",
    });
  }

  await supabase.from("task_proposals")
    .update({ status: "accepted", decided_at: new Date().toISOString() }).eq("id", best.id);

  const instruction = [
    best.title,
    best.rationale ? `Kontext: ${best.rationale}` : "",
    best.expected_outcome ? `Očakávaný výstup: ${best.expected_outcome}` : "",
  ].filter(Boolean).join("\n");

  const outcome = await runAgentStep({
    userId, agentId, title: best.title, instruction,
    depth: 1, proposalId: best.id,
  });

  if (outcome.status === "blocked") {
    return NextResponse.json({
      done: true,
      step: { title: best.title, status: outcome.status, cost: formatEur(outcome.costEur) },
      stopReason: `Agent narazil na chýbajúce napojenie: ${outcome.blocked?.tool}. ${outcome.blocked?.hint ?? ""}`,
    });
  }
  if (outcome.status === "failed") {
    return NextResponse.json({
      done: true,
      step: { title: best.title, status: outcome.status, cost: formatEur(outcome.costEur) },
      stopReason: `Krok zlyhal: ${outcome.output}`,
    });
  }

  return NextResponse.json({
    done: false,
    step: { title: best.title, status: outcome.status, cost: formatEur(outcome.costEur) },
  });
}
