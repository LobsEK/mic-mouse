"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";
import { runAgentStep, ensureConnectors } from "@/lib/agents/engine";
import type { AgentFull, TaskProposal } from "@/lib/types";

/** Run an agent right now on a concrete instruction (or on its standing goal). */
export async function runAgentNow(agentId: string, instruction?: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data: agent } = await supabase
    .from("agents").select("*").eq("id", agentId).eq("owner_id", userId).single();
  if (!agent) throw new Error("Agent sa nenašiel.");
  const a = agent as AgentFull;

  const task =
    instruction?.trim() ||
    a.goal?.trim() ||
    (typeof a.config?.instructions === "string" ? (a.config.instructions as string) : "") ||
    "Pozri sa na aktuálny stav CRM a urob najužitočnejší ďalší krok vo svojej oblasti.";

  const outcome = await runAgentStep({
    userId, agentId, title: firstLine(task), instruction: task, depth: 0,
  });
  revalidatePath("/");
  return outcome;
}

/** Accept a proposed next step — this actually executes it. */
export async function acceptProposal(proposalId: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("task_proposals").select("*").eq("id", proposalId).eq("owner_id", userId).single();
  if (!p) throw new Error("Návrh sa nenašiel.");
  const proposal = p as TaskProposal;

  await supabase.from("task_proposals")
    .update({ status: "accepted", decided_at: new Date().toISOString() }).eq("id", proposalId);

  const instruction = [
    proposal.title,
    proposal.rationale ? `Kontext: ${proposal.rationale}` : "",
    proposal.expected_outcome ? `Očakávaný výstup: ${proposal.expected_outcome}` : "",
  ].filter(Boolean).join("\n");

  const outcome = await runAgentStep({
    userId, agentId: proposal.agent_id, title: proposal.title,
    instruction, depth: 1, proposalId,
  });
  revalidatePath("/");
  return outcome;
}

export async function dismissProposal(proposalId: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("task_proposals")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("id", proposalId).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function toggleAutopilot(agentId: string, on: boolean) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("agents")
    .update({ autopilot: on }).eq("id", agentId).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function setAgentBudget(agentId: string, tokenBudget: number) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("agents")
    .update({ token_budget: Math.max(10000, Math.round(tokenBudget)) })
    .eq("id", agentId).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function setAgentGoal(agentId: string, goal: string, requiredTools: string[]) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("agents")
    .update({ goal: goal.trim() || null, required_tools: requiredTools })
    .eq("id", agentId).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/** Clears the "agent is stuck working" state if a run died mid-flight. */
export async function resetAgentHealth(agentId: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  await supabase.from("agents")
    .update({ health: "idle", current_activity: null, last_error: null, last_error_hint: null })
    .eq("id", agentId).eq("owner_id", userId);
  revalidatePath("/");
}

export async function markEventsSeen() {
  const { userId } = await verifySession();
  const supabase = await createClient();
  await supabase.from("agent_events")
    .update({ seen_at: new Date().toISOString() }).eq("owner_id", userId).is("seen_at", null);
  revalidatePath("/");
}

export async function initWorkspace() {
  const { userId } = await verifySession();
  await ensureConnectors(userId);
  revalidatePath("/");
}

function firstLine(s: string): string {
  const line = s.split("\n")[0].trim();
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}
