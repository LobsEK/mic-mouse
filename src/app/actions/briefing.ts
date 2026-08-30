"use server";

import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { ensureConnectors } from "@/lib/agents/engine";
import { formatEur } from "@/lib/agents/costs";

export type BriefingResult = {
  content: string;
  stats: {
    agents: number;
    working: number;
    blocked: number;
    errored: number;
    idle: number;
    proposals: number;
    approvals: number;
    unseenErrors: number;
    spentEur: number;
  };
  problems: { agent: string; problem: string; hint: string }[];
};

/**
 * What Apollo says when you come back: a real status report computed from the
 * database — how many agents are working, how many are stuck and on what,
 * what is waiting for your decision. No invented numbers.
 */
export async function getBriefing(): Promise<BriefingResult> {
  const { userId } = await verifySession();
  await ensureConnectors(userId);
  const supabase = await createClient();

  const [{ data: agents }, { data: proposals }, { data: runs }, { data: events }, { data: connectors }] =
    await Promise.all([
      supabase.from("agents").select("*").eq("owner_id", userId),
      supabase.from("task_proposals").select("id,title,verdict").eq("owner_id", userId).eq("status", "proposed"),
      supabase.from("agent_runs").select("id,status,title,cost_eur").eq("owner_id", userId),
      supabase.from("agent_events").select("*").eq("owner_id", userId).is("seen_at", null)
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("connectors").select("key,label,status").eq("owner_id", userId),
    ]);

  const A = agents ?? [];
  const notConnected = (connectors ?? []).filter((c) => c.status !== "connected").map((c) => c.key);

  const problems: BriefingResult["problems"] = [];
  for (const a of A) {
    if (a.health === "blocked" || a.health === "error") {
      problems.push({
        agent: a.name,
        problem: a.last_error ?? (a.health === "blocked" ? "Zablokovaný" : "Chyba pri behu"),
        hint: a.last_error_hint ?? "Otvor detail agenta a spusti ho znova.",
      });
    }
    const missing = (a.required_tools ?? []).filter((t: string) => notConnected.includes(t));
    if (missing.length && a.health !== "blocked") {
      problems.push({
        agent: a.name,
        problem: `Potrebuje napojenie: ${missing.join(", ")}`,
        hint: "Kým to nenapojíš, tieto kroky vie len pripraviť na schválenie, nie vykonať.",
      });
    }
  }

  const stats: BriefingResult["stats"] = {
    agents: A.length,
    working: A.filter((a) => a.health === "working").length,
    blocked: A.filter((a) => a.health === "blocked").length,
    errored: A.filter((a) => a.health === "error").length,
    idle: A.filter((a) => a.health === "idle").length,
    proposals: (proposals ?? []).length,
    approvals: (runs ?? []).filter((r) => r.status === "needs_approval").length,
    unseenErrors: (events ?? []).filter((e) => e.level === "error").length,
    spentEur: Math.round((runs ?? []).reduce((s, r) => s + Number(r.cost_eur || 0), 0) * 100) / 100,
  };

  if (stats.agents === 0) {
    return {
      content:
        "Zatiaľ nemáš žiadneho agenta. Povedz mi, čo má robiť — napr. „sleduj nové kontakty bez obchodu a priprav im oslovenie“ — a vytvorím ho.",
      stats, problems,
    };
  }

  // Let Claude phrase it like a colleague reporting in, from the real numbers.
  let content = "";
  try {
    const anthropic = getAnthropic();
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 350,
      system:
        "Si Apollo, nadriadený agent. Používateľ sa práve vrátil. Podaj mu krátke hlásenie po slovensky (max 5 viet, bez odrážok, bez pozdravných fráz typu 'dúfam že sa máš dobre'). " +
        "Povedz: koľko agentov pracuje, koľko ich má problém a aký, čo im chýba, a čo čaká na jeho rozhodnutie. " +
        "Ak niečo blokuje prácu, konkrétne povedz čo treba spraviť. Buď vecný, ako kolega ktorý drží službu.",
      messages: [{
        role: "user",
        content: JSON.stringify({
          stats,
          problems,
          nespracovane_udalosti: (events ?? []).slice(0, 8).map((e) => ({ level: e.level, message: e.message, hint: e.hint })),
          otvorene_navrhy: (proposals ?? []).slice(0, 6),
          minute_naklady: formatEur(stats.spentEur),
        }),
      }],
    });
    content = res.content.find((b) => b.type === "text")?.text?.trim() ?? "";
  } catch {
    content = fallbackBriefing(stats, problems);
  }
  if (!content) content = fallbackBriefing(stats, problems);

  await supabase.from("briefings").insert({ owner_id: userId, content, stats });

  return { content, stats, problems };
}

function fallbackBriefing(s: BriefingResult["stats"], problems: BriefingResult["problems"]): string {
  const parts = [
    `Máš ${s.agents} agentov: ${s.working} práve pracuje, ${s.idle} čaká na zadanie.`,
  ];
  if (s.blocked || s.errored) {
    parts.push(`${s.blocked + s.errored} má problém: ${problems.map((p) => `${p.agent} — ${p.problem}`).join("; ")}.`);
  }
  if (s.approvals) parts.push(`${s.approvals} vec čaká na tvoje schválenie.`);
  if (s.proposals) parts.push(`${s.proposals} navrhnutých ďalších krokov čaká na rozhodnutie.`);
  parts.push(`Doteraz minuté: ${formatEur(s.spentEur)}.`);
  return parts.join(" ");
}
