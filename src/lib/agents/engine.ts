import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { AGENT_TOOLS, toolsForConnectors, type ToolCtx } from "@/lib/agents/tools";
import { costEur, decideVerdict, estimateCostEur, formatEur } from "@/lib/agents/costs";
import type { AgentFull, Verdict } from "@/lib/types";

const DEFAULT_CONNECTORS = [
  { key: "crm", label: "Interné CRM (kontakty, obchody, úlohy)", status: "connected",
    detail: "Vstavané. Agent číta aj zapisuje priamo do tvojej databázy." },
  { key: "web", label: "Web research (vyhľadávanie na internete)", status: "connected",
    detail: "Vstavané cez Claude web search. Agent si vie naozaj dohľadať informácie o firme alebo kontakte." },
  { key: "email", label: "Odosielanie e-mailov (SMTP / Gmail)", status: "not_connected",
    detail: "Zatiaľ nenapojené. Agent vie e-mail napísať a pripraviť na schválenie, odoslať ho musíš ty." },
  { key: "linkedin", label: "LinkedIn", status: "not_connected",
    detail: "Zatiaľ nenapojené. Potrebný oficiálny prístup alebo nástroj tretej strany." },
  { key: "x", label: "X / Twitter", status: "not_connected",
    detail: "Zatiaľ nenapojené. Vyžaduje X API účet s plateným prístupom na zápis." },
  { key: "ads", label: "Reklamné platformy (Meta / Google / LinkedIn Ads)", status: "not_connected",
    detail: "Zatiaľ nenapojené. Agent vie kampaň naplánovať a napísať, spustiť ju musíš ty." },
  { key: "analytics", label: "Analytika (GA4)", status: "not_connected",
    detail: "Zatiaľ nenapojené. Bez nej agent nevie merať reálne dosahy kampaní." },
];

/** Makes sure the user has the honest capability list. Idempotent. */
export async function ensureConnectors(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("connectors").select("key").eq("owner_id", userId);
  const have = new Set((data ?? []).map((c) => c.key));
  const missing = DEFAULT_CONNECTORS.filter((c) => !have.has(c.key));
  if (missing.length) {
    await supabase.from("connectors").insert(missing.map((c) => ({ ...c, owner_id: userId })));
  }
}

async function connectedKeys(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connectors").select("key,status").eq("owner_id", userId).eq("status", "connected");
  return new Set((data ?? []).map((c) => c.key as string));
}

export type StepOutcome = {
  runId: string;
  status: "done" | "needs_approval" | "blocked" | "failed";
  output: string;
  blocked?: { tool: string; hint: string };
  inputTokens: number;
  outputTokens: number;
  costEur: number;
};

/**
 * Runs ONE real agent step. Everything here actually happens: the model reads
 * the user's real CRM, may really search the web, and really writes rows. If a
 * step needs a channel that is not connected, the agent says so via
 * report_blocked instead of pretending it sent something.
 */
export async function runAgentStep(opts: {
  userId: string;
  agentId: string;
  title: string;
  instruction: string;
  depth?: number;
  proposalId?: string | null;
  kind?: string;
}): Promise<StepOutcome> {
  const supabase = await createClient();
  const { userId, agentId } = opts;

  await ensureConnectors(userId);

  const { data: agentRow } = await supabase
    .from("agents").select("*").eq("id", agentId).eq("owner_id", userId).single();
  if (!agentRow) throw new Error("Agent sa nenašiel.");
  const agent = agentRow as AgentFull;

  if (agent.tokens_used >= agent.token_budget) {
    throw new Error(
      `Agent "${agent.name}" vyčerpal svoj tokenový rozpočet (${agent.tokens_used}/${agent.token_budget}). Zvýš ho v detaile agenta.`
    );
  }

  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      owner_id: userId, agent_id: agentId, title: opts.title,
      kind: opts.kind ?? "task", status: "running",
      autopilot_depth: opts.depth ?? 0, parent_proposal_id: opts.proposalId ?? null,
      input: { instruction: opts.instruction },
    })
    .select().single();
  if (runErr) throw new Error(runErr.message);

  await supabase.from("agents").update({
    health: "working", current_activity: opts.title, last_run_at: new Date().toISOString(),
  }).eq("id", agentId);

  const ctx: ToolCtx = { supabase, userId, agentId, runId: run.id };
  let stepNo = 0;
  const logStep = async (label: string, status: string, detail?: string) => {
    stepNo += 1;
    await supabase.from("run_steps").insert({
      owner_id: userId, run_id: run.id, step_no: stepNo, label, status, detail: detail ?? null,
    });
  };

  await logStep("Čítam zadanie a stav CRM", "done");

  const connected = await connectedKeys(userId);
  const missingTools = (agent.required_tools ?? []).filter((t) => !connected.has(t));

  const tools: Anthropic.ToolUnion[] = [...toolsForConnectors(connected)];
  if (connected.has("web")) {
    tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 } as Anthropic.ToolUnion);
  }

  const notConnectedList = DEFAULT_CONNECTORS
    .filter((c) => !connected.has(c.key))
    .map((c) => `- ${c.key}: ${c.label} — ${c.detail}`)
    .join("\n");

  const system = `Si autonómny pracovný agent "${agent.name}" (typ: ${agent.kind}) pre firmu Instaview.
${agent.goal ? `Tvoj dlhodobý cieľ: ${agent.goal}` : ""}
${typeof agent.config?.instructions === "string" ? `Tvoje inštrukcie: ${agent.config.instructions}` : ""}

PRAVIDLÁ:
1. Rob skutočnú prácu cez nástroje. Nikdy nepredstieraj vykonanú akciu. Ak niečo nemôžeš naozaj urobiť, zavolaj report_blocked.
2. Pred ďalším oslovením kontaktu si vždy over crm_history — ak už 3× neodpovedal, NEPOKRAČUJ rovnakým kanálom, zvoľ inú stratégiu a povedz prečo.
3. Šetri čas a tokeny. Nerob dlhé rešerše na malé firmy s nízkou hodnotou. Vždy zvažuj výkon vs. náklad.
4. Výsledok napíš stručne po slovensky: čo si naozaj urobil, čo si zistil, a čo z toho vyplýva.

TIETO KANÁLY NIE SÚ NAPOJENÉ (nedajú sa použiť, len pripraviť podklad + report_blocked):
${notConnectedList || "— všetko potrebné je napojené —"}`;

  const convo: Anthropic.MessageParam[] = [{ role: "user", content: opts.instruction }];
  const anthropic = getAnthropic();

  let inputTokens = 0;
  let outputTokens = 0;
  let finalText = "";
  let blocked: { tool: string; hint: string } | undefined;
  let producedDraft = false;

  try {
    for (let turn = 0; turn < 8; turn++) {
      const res = await anthropic.messages.create({
        model: CLAUDE_MODEL, max_tokens: 1600, system, tools, messages: convo,
      });
      inputTokens += res.usage.input_tokens ?? 0;
      outputTokens += res.usage.output_tokens ?? 0;

      const usedWebSearch = res.content.some((b) => b.type === "server_tool_use");
      if (usedWebSearch) await logStep("Hľadám informácie na webe", "done");

      convo.push({ role: "assistant", content: res.content });

      if (res.stop_reason !== "tool_use") {
        finalText = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        break;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const def = AGENT_TOOLS[block.name];
        if (!def) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: `Neznámy nástroj ${block.name}`, is_error: true });
          continue;
        }
        await logStep(labelForTool(block.name, block.input as Record<string, unknown>), "running");
        const out = await def.run(ctx, (block.input ?? {}) as Record<string, unknown>);
        await supabase.from("run_steps").update({ status: out.isError ? "failed" : "done" })
          .eq("run_id", run.id).eq("step_no", stepNo);
        if (block.name === "draft_message") producedDraft = true;
        if (out.blocked) blocked = out.blocked;
        results.push({ type: "tool_result", tool_use_id: block.id, content: out.summary, is_error: out.isError });
      }
      convo.push({ role: "user", content: results });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const cost = costEur(inputTokens, outputTokens);
    await supabase.from("agent_runs").update({
      status: "failed", error: msg, input_tokens: inputTokens, output_tokens: outputTokens,
      cost_eur: cost, finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    await supabase.from("agents").update({
      health: "error", current_activity: null, last_error: msg,
      last_error_hint: hintForError(msg),
      tokens_used: agent.tokens_used + inputTokens + outputTokens,
      cost_eur: Number(agent.cost_eur) + cost,
    }).eq("id", agentId);
    await supabase.from("agent_events").insert({
      owner_id: userId, agent_id: agentId, run_id: run.id, level: "error",
      message: `${agent.name}: ${msg}`, hint: hintForError(msg),
    });
    return { runId: run.id, status: "failed", output: msg, inputTokens, outputTokens, costEur: cost };
  }

  const cost = costEur(inputTokens, outputTokens);
  const status: StepOutcome["status"] = blocked ? "blocked" : producedDraft ? "needs_approval" : "done";

  await supabase.from("agent_runs").update({
    status, output: finalText, model: CLAUDE_MODEL,
    input_tokens: inputTokens, output_tokens: outputTokens, cost_eur: cost,
    blocked_reason: blocked ? `${blocked.tool}: ${blocked.hint}` : null,
    finished_at: new Date().toISOString(),
  }).eq("id", run.id);

  await supabase.from("agents").update({
    health: blocked ? "blocked" : "idle",
    current_activity: null,
    last_error: blocked ? `Chýba napojenie: ${blocked.tool}` : null,
    last_error_hint: blocked ? blocked.hint : null,
    tokens_used: agent.tokens_used + inputTokens + outputTokens,
    cost_eur: Number(agent.cost_eur) + cost,
  }).eq("id", agentId);

  if (blocked) {
    await supabase.from("agent_events").insert({
      owner_id: userId, agent_id: agentId, run_id: run.id, level: "warn",
      message: `${agent.name} sa zastavil — nie je napojený ${blocked.tool}.`, hint: blocked.hint,
    });
  } else {
    await supabase.from("agent_events").insert({
      owner_id: userId, agent_id: agentId, run_id: run.id, level: "info",
      message: `${agent.name} dokončil: ${opts.title} (${formatEur(cost)})`, hint: null,
    });
  }
  if (missingTools.length) {
    await supabase.from("agent_events").insert({
      owner_id: userId, agent_id: agentId, level: "warn",
      message: `${agent.name} má v zadaní nástroje, ktoré nie sú napojené: ${missingTools.join(", ")}.`,
      hint: "Kým ich nenapojíš, tieto kroky vie len pripraviť, nie vykonať.",
    });
  }

  if (opts.proposalId) {
    await supabase.from("task_proposals")
      .update({ status: "executed", decided_at: new Date().toISOString() }).eq("id", opts.proposalId);
  }

  await proposeNextSteps({ userId, agent, runId: run.id, doneTitle: opts.title, result: finalText, blocked });

  return { runId: run.id, status, output: finalText, blocked, inputTokens, outputTokens, costEur: cost };
}

function labelForTool(name: string, input: Record<string, unknown>): string {
  const who = typeof input.contactName === "string" ? ` — ${input.contactName}` : "";
  switch (name) {
    case "crm_search": return `Prehľadávam CRM${typeof input.query === "string" && input.query ? ` — "${input.query}"` : ""}`;
    case "crm_history": return `Kontrolujem históriu pokusov${who}`;
    case "crm_create_contact": return `Zakladám kontakt${typeof input.name === "string" ? ` — ${input.name}` : ""}`;
    case "crm_create_deal": return `Zakladám obchod${typeof input.title === "string" ? ` — ${input.title}` : ""}`;
    case "crm_note": return `Zapisujem zistenie do CRM${who}`;
    case "create_task": return `Vytváram úlohu`;
    case "draft_message": return `Píšem návrh${who}`;
    case "report_blocked": return `Hlásim chýbajúce napojenie`;
    default: return name;
  }
}

function hintForError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("anthropic_api_key")) return "Chýba ANTHROPIC_API_KEY v nastaveniach nasadenia (Vercel → Environment Variables).";
  if (m.includes("workspace")) return "Tvoj Claude kľúč je viazaný na identitu — doplň ANTHROPIC_WORKSPACE_ID (nájdeš ho v URL workspace na console.anthropic.com), alebo vytvor kľúč priamo vo workspace.";
  if (m.includes("401") || m.includes("authentication")) return "Claude API kľúč je neplatný alebo vypršal — vygeneruj nový na console.anthropic.com.";
  if (m.includes("429") || m.includes("rate")) return "Prekročený limit Claude API. Skús o chvíľu, alebo zvýš limity v Anthropic konzole.";
  if (m.includes("credit") || m.includes("billing")) return "Na Anthropic účte nie je kredit — doplň platbu v Billing.";
  if (m.includes("rozpočet")) return "Zvýš tokenový rozpočet agenta v jeho detaile.";
  return "Pozri detail behu v Approvals; ak sa opakuje, skús agenta spustiť znova.";
}

/**
 * After every completed step the agent must think TWO steps ahead: it proposes
 * exactly 2 follow-ups that naturally continue the work, each with an estimate
 * and a performance-vs-cost verdict. The verdict itself is computed by our own
 * deterministic rule (costs.ts), not left to the model's mood.
 */
export async function proposeNextSteps(args: {
  userId: string;
  agent: AgentFull;
  runId: string;
  doneTitle: string;
  result: string;
  blocked?: { tool: string; hint: string };
}) {
  const supabase = await createClient();
  const anthropic = getAnthropic();

  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 900,
      system: `Si plánovacia časť agenta "${args.agent.name}". Práve dokončil krok a ty navrhuješ PRESNE 2 ďalšie kroky, ktoré prirodzene pokračujú v práci — jeden "sledovací" (overiť reakciu, dopad, či sa dá konverzácia rozvinúť) a jeden "rozvíjací" (ďalší krok kampane alebo obchodu, nový cieľ, iná stratégia).

Odpovedz VÝLUČNE JSON poľom presne 2 objektov:
[{"title": string, "rationale": string, "expected_outcome": string, "est_tokens": number, "impact": 1-5, "effort": 1-5, "requires_tools": string[]}]

- title: krátke, akčné zadanie v slovenčine (max 12 slov)
- rationale: prečo to logicky nasleduje (1 veta)
- expected_outcome: čo konkrétne z toho človek dostane (1 veta)
- est_tokens: realistický odhad spotreby tokenov (typicky 3000-25000)
- impact: očakávaný obchodný dopad, effort: náročnosť
- requires_tools: z {crm, web, email, linkedin, x, ads, analytics}
Ak predchádzajúci krok zlyhal alebo bol zablokovaný, jeden z návrhov musí riešiť odblokovanie alebo inú stratégiu.`,
      messages: [{
        role: "user",
        content: `Dokončený krok: ${args.doneTitle}
Výsledok: ${args.result?.slice(0, 2500) || "(bez textového výstupu)"}
${args.blocked ? `POZOR: krok bol zablokovaný, chýba napojenie "${args.blocked.tool}".` : ""}`,
      }],
    });

    const text = res.content.find((b) => b.type === "text")?.text ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    const raw = JSON.parse(match ? match[0] : "[]") as Array<Record<string, unknown>>;

    const connected = await connectedKeys(args.userId);

    const rows = raw.slice(0, 2).map((p) => {
      const estTokens = Math.max(1000, Math.round(Number(p.est_tokens) || 6000));
      const estCost = estimateCostEur(estTokens);
      const impact = clamp(Number(p.impact) || 3);
      const effort = clamp(Number(p.effort) || 3);
      const requires = Array.isArray(p.requires_tools) ? (p.requires_tools as string[]) : [];
      const { verdict, reason } = decideVerdict({ impact, effort, estCostEur: estCost });
      const missing = requires.filter((t) => !connected.has(t));
      const finalVerdict: Verdict = missing.length ? "borderline" : verdict;
      const finalReason = missing.length
        ? `${reason} Navyše chýba napojenie: ${missing.join(", ")} — agent to vie len pripraviť.`
        : reason;
      return {
        owner_id: args.userId, agent_id: args.agent.id, parent_run_id: args.runId,
        title: String(p.title || "Ďalší krok"),
        rationale: String(p.rationale || ""),
        expected_outcome: String(p.expected_outcome || ""),
        est_tokens: estTokens, est_cost_eur: estCost,
        impact, effort, verdict: finalVerdict, verdict_reason: finalReason,
        requires_tools: requires, status: missing.length ? "blocked" : "proposed",
      };
    });

    if (rows.length) await supabase.from("task_proposals").insert(rows);
  } catch {
    // Planning is a bonus on top of the finished work — never fail the run over it.
    await supabase.from("agent_events").insert({
      owner_id: args.userId, agent_id: args.agent.id, run_id: args.runId, level: "warn",
      message: `${args.agent.name} dokončil krok, ale nepodarilo sa navrhnúť ďalšie kroky.`,
      hint: "Skús spustiť agenta znova, alebo zadaj ďalší krok ručne.",
    });
  }
}

function clamp(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}
