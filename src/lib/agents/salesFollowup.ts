import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import type { Contact, Deal, Settings } from "@/lib/types";

async function getOrCreateSalesAgent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: existing } = await supabase
    .from("agents")
    .select("*")
    .eq("owner_id", userId)
    .eq("kind", "sales")
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("agents")
    .insert({ owner_id: userId, name: "Sales agent", kind: "sales", status: "active" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created;
}

/**
 * Core, reusable "real agent" logic: reads a contact's actual CRM data,
 * asks Claude to draft a genuine follow-up email, and stores it as an
 * agent_run awaiting human approval. Used by both the Sales view button
 * and the Apollo assistant's `draft_followup_email` tool.
 */
export async function draftFollowupForContact(userId: string, contactId: string) {
  const supabase = await createClient();

  const [{ data: contact }, { data: deal }, { data: settings }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", contactId).eq("owner_id", userId).single(),
    supabase
      .from("deals")
      .select("*")
      .eq("owner_id", userId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("settings").select("*").eq("owner_id", userId).maybeSingle(),
  ]);

  if (!contact) throw new Error("Kontakt sa nenašiel.");

  const agent = await getOrCreateSalesAgent(supabase, userId);
  const c = contact as Contact;
  const d = deal as Deal | null;
  const s = settings as Settings | null;

  const { data: run, error: insertErr } = await supabase
    .from("agent_runs")
    .insert({
      owner_id: userId,
      agent_id: agent.id,
      contact_id: c.id,
      input: { contact: c, deal: d },
      status: "pending",
    })
    .select()
    .single();
  if (insertErr) throw new Error(insertErr.message);

  try {
    const anthropic = getAnthropic();
    const context = [
      `Kontakt: ${c.name}${c.role ? `, ${c.role}` : ""}${c.company ? ` @ ${c.company}` : ""}`,
      c.email ? `E-mail: ${c.email}` : null,
      c.tags?.length ? `Tagy: ${c.tags.join(", ")}` : null,
      d
        ? `Súvisiaci obchod: "${d.title}", štádium ${d.stage}, hodnota ${d.value} €${
            d.note ? `, poznámka: ${d.note}` : ""
          }`
        : "Zatiaľ bez priradeného obchodu.",
    ]
      .filter(Boolean)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system:
        `Si Sales agent pre firmu ${s?.company_name || "Instaview"}. Píšeš stručné, ľudské, ` +
        `konkrétne follow-up e-maily v slovenčine (alebo v jazyku kontaktu, ak je z toho zrejmý), ` +
        `tón: ${s?.tone || "priateľský, stručný, profesionálny"}. Podpíš ako ${
          s?.sender_name || "tím"
        }. Vráť LEN text e-mailu (predmet na prvom riadku ako "Predmet: ...", potom prázdny riadok, potom telo), žiadne vysvetlenia navyše.`,
      messages: [{ role: "user", content: `Naformuluj follow-up e-mail pre tento kontakt:\n\n${context}` }],
    });

    const draft = msg.content.find((b) => b.type === "text")?.text ?? "";

    await supabase
      .from("agent_runs")
      .update({ output: draft, model: CLAUDE_MODEL, status: "needs_approval" })
      .eq("id", run.id);

    await supabase.from("tasks").insert({
      owner_id: userId,
      agent_id: agent.id,
      title: `Schváliť follow-up pre ${c.name}`,
      state: "ai",
    });

    return { runId: run.id as string, draft };
  } catch (e) {
    await supabase
      .from("agent_runs")
      .update({ status: "failed", error: e instanceof Error ? e.message : String(e) })
      .eq("id", run.id);
    throw e;
  }
}
