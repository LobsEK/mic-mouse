"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";

// ---------------- CONTACTS ----------------

export async function createContact(input: {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
}) {
  const { userId } = await verifySession();
  if (!input.name?.trim()) throw new Error("Meno kontaktu je povinné.");

  const supabase = await createClient();
  const { error } = await supabase.from("contacts").insert({
    owner_id: userId,
    name: input.name.trim(),
    company: input.company?.trim() || null,
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function deleteContact(id: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// ---------------- DEALS ----------------

export async function createDeal(input: {
  title: string;
  contactId?: string | null;
  value?: number;
  stage?: string;
  closeDate?: string;
  note?: string;
}) {
  const { userId } = await verifySession();
  if (!input.title?.trim()) throw new Error("Názov obchodu je povinný.");

  const supabase = await createClient();
  const { error } = await supabase.from("deals").insert({
    owner_id: userId,
    contact_id: input.contactId || null,
    title: input.title.trim(),
    value: input.value ?? 0,
    stage: input.stage || "Qualified",
    close_date: input.closeDate || null,
    note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function updateDealStage(id: string, stage: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({ stage })
    .eq("id", id)
    .eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function deleteDeal(id: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("deals").delete().eq("id", id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// ---------------- TASKS ----------------

export async function createTask(input: { title: string; state: "ai" | "me"; agentId?: string | null }) {
  const { userId } = await verifySession();
  if (!input.title?.trim()) throw new Error("Text úlohy je povinný.");

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    owner_id: userId,
    title: input.title.trim(),
    state: input.state,
    agent_id: input.agentId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function setTaskState(id: string, state: "ai" | "me" | "done") {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ state }).eq("id", id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function deleteTask(id: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
