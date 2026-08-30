"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { draftFollowupForContact } from "@/lib/agents/salesFollowup";
import type { AgentKind } from "@/lib/types";

const VALID_TOOLS = ["crm", "web", "email", "linkedin", "x", "ads", "analytics"];

// ---------------- AGENTS ----------------

export async function createAgent(input: { name: string; kind: AgentKind }) {
  const { userId } = await verifySession();
  if (!input.name?.trim()) throw new Error("Agent musí mať meno.");

  const supabase = await createClient();
  const { error } = await supabase.from("agents").insert({
    owner_id: userId,
    name: input.name.trim(),
    kind: input.kind,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function toggleAgentStatus(id: string, status: "active" | "paused") {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("agents").update({ status }).eq("id", id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/**
 * Generates a brand-new agent from a plain-English description using Claude
 * (the "Agent Builder" / "Generate" box from the original design). This is a
 * REAL Claude call — the model reads the prompt and returns a structured
 * agent definition, which we save for real.
 */
export async function generateAgentFromPrompt(prompt: string) {
  const { userId } = await verifySession();
  if (!prompt?.trim()) throw new Error("Popíš, čo má agent robiť.");

  const anthropic = getAnthropic();
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 500,
    system:
      "Si Agent Builder pre B2B agentúru. Z popisu úlohy od používateľa vytvor definíciu jedného automatizačného agenta. " +
      "Odpovedz VÝLUČNE validným JSON objektom v tvare " +
      '{"name": string, "kind": "sales"|"ads"|"marketing"|"support", "goal": string, "instructions": string, "required_tools": string[]}. ' +
      "name je krátky výstižný názov (max 5 slov). goal je jednovetný dlhodobý cieľ agenta. " +
      "instructions je jasný, akčný popis toho, čo má agent pri každom behu robiť (2-5 viet), v slovenčine. " +
      "required_tools sú kanály, ktoré na svoju prácu naozaj potrebuje, výlučne z množiny " +
      '{"crm","web","email","linkedin","x","ads","analytics"} — buď úprimný: ak má písať e-maily, patrí tam "email"; ' +
      'ak má komentovať na X, patrí tam "x"; ak má merať dosahy, patrí tam "analytics".',
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
  let parsed: {
    name?: string; kind?: string; goal?: string;
    instructions?: string; required_tools?: string[];
  } = {};
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    throw new Error("Claude vrátil neočakávaný formát, skús presnejší popis.");
  }

  const kind: AgentKind = (["sales", "ads", "marketing", "support"] as const).includes(
    parsed.kind as AgentKind
  )
    ? (parsed.kind as AgentKind)
    : "sales";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .insert({
      owner_id: userId,
      name: parsed.name?.trim() || "Nový agent",
      kind,
      status: "active",
      goal: parsed.goal?.trim() || null,
      required_tools: VALID_TOOLS.filter((t) => (parsed.required_tools ?? []).includes(t)),
      config: { instructions: parsed.instructions || prompt, source_prompt: prompt },
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  return data;
}

// ---------------- SALES AGENT: real Claude follow-up draft ----------------

/**
 * The first end-to-end real agent: given a contact, ask Claude to draft a
 * genuine follow-up email using that contact's real CRM data (and the linked
 * deal, if any). The draft is saved as an agent_run with status
 * "needs_approval" — nothing is ever sent automatically, a human approves it
 * in the Approvals view first.
 */
export async function runSalesFollowup(contactId: string) {
  const { userId } = await verifySession();
  await draftFollowupForContact(userId, contactId);
  revalidatePath("/");
}

// ---------------- APPROVALS ----------------

export async function decideAgentRun(id: string, decision: "approved" | "rejected") {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
