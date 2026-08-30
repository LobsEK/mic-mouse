import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ToolCtx = {
  supabase: SupabaseClient;
  userId: string;
  agentId: string;
  runId: string;
};

export type ToolResult = { summary: string; isError?: boolean; blocked?: { tool: string; hint: string } };

export type AgentToolDef = {
  /** Which connector must be 'connected' for this tool to be offered to the model. */
  requires: string;
  schema: Anthropic.Tool;
  run: (ctx: ToolCtx, input: Record<string, unknown>) => Promise<ToolResult>;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const AGENT_TOOLS: Record<string, AgentToolDef> = {
  // ---------------- CRM (always available: it is our own database) ----------------
  crm_search: {
    requires: "crm",
    schema: {
      name: "crm_search",
      description:
        "Search the user's own CRM. Returns matching contacts, deals and open tasks. Use this before assuming anything about a person or company.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, company or keyword. Empty string returns a recent overview." },
        },
        required: ["query"],
      },
    },
    run: async (ctx, input) => {
      const q = str(input.query);
      const like = `%${q}%`;
      const [contacts, deals, tasks] = await Promise.all([
        q
          ? ctx.supabase.from("contacts").select("id,name,company,role,email,tags").eq("owner_id", ctx.userId).or(`name.ilike.${like},company.ilike.${like}`).limit(10)
          : ctx.supabase.from("contacts").select("id,name,company,role,email,tags").eq("owner_id", ctx.userId).limit(10),
        q
          ? ctx.supabase.from("deals").select("id,title,stage,value,note,contact_id").eq("owner_id", ctx.userId).ilike("title", like).limit(10)
          : ctx.supabase.from("deals").select("id,title,stage,value,note,contact_id").eq("owner_id", ctx.userId).limit(10),
        ctx.supabase.from("tasks").select("id,title,state").eq("owner_id", ctx.userId).neq("state", "done").limit(10),
      ]);
      return {
        summary: JSON.stringify({
          contacts: contacts.data ?? [],
          deals: deals.data ?? [],
          open_tasks: tasks.data ?? [],
        }),
      };
    },
  },

  crm_history: {
    requires: "crm",
    schema: {
      name: "crm_history",
      description:
        "Look up what this agent already tried with a contact: previous runs, drafts, whether anything was approved, and how many attempts went without a reply. ALWAYS call this before proposing another outreach attempt, so you do not burn tokens chasing someone who never answers.",
      input_schema: {
        type: "object",
        properties: { contactName: { type: "string" } },
        required: ["contactName"],
      },
    },
    run: async (ctx, input) => {
      const name = str(input.contactName);
      const { data: contact } = await ctx.supabase
        .from("contacts")
        .select("id,name,company")
        .eq("owner_id", ctx.userId)
        .ilike("name", `%${name}%`)
        .limit(1)
        .maybeSingle();
      if (!contact) return { summary: `Kontakt "${name}" nie je v CRM.` };

      const { data: runs } = await ctx.supabase
        .from("agent_runs")
        .select("id,title,kind,status,created_at")
        .eq("owner_id", ctx.userId)
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
        .limit(20);

      const attempts = (runs ?? []).filter((r) => r.kind === "outreach" || r.kind === "task").length;
      const approved = (runs ?? []).filter((r) => r.status === "approved").length;
      return {
        summary: JSON.stringify({
          contact,
          attempts_total: attempts,
          approved_and_sent: approved,
          runs: runs ?? [],
          note: "Ak attempts_total >= 3 a approved_and_sent = 0, ďalší pokus rovnakým kanálom sa neoplatí.",
        }),
      };
    },
  },

  crm_create_contact: {
    requires: "crm",
    schema: {
      name: "crm_create_contact",
      description: "Add a new contact to the CRM.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          role: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
        required: ["name"],
      },
    },
    run: async (ctx, input) => {
      const name = str(input.name);
      if (!name) return { summary: "Chýba meno.", isError: true };
      const { error } = await ctx.supabase.from("contacts").insert({
        owner_id: ctx.userId,
        name,
        company: str(input.company) || null,
        role: str(input.role) || null,
        email: str(input.email) || null,
        phone: str(input.phone) || null,
      });
      if (error) return { summary: error.message, isError: true };
      return { summary: `Kontakt ${name} pridaný do CRM.` };
    },
  },

  crm_create_deal: {
    requires: "crm",
    schema: {
      name: "crm_create_deal",
      description: "Create a sales deal, optionally linked to an existing contact by name.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          contactName: { type: "string" },
          value: { type: "number" },
          stage: { type: "string", enum: ["Qualified", "Proposal", "Negotiation", "Won", "Lost"] },
          note: { type: "string" },
        },
        required: ["title"],
      },
    },
    run: async (ctx, input) => {
      const title = str(input.title);
      if (!title) return { summary: "Chýba názov obchodu.", isError: true };
      let contactId: string | null = null;
      if (str(input.contactName)) {
        const { data } = await ctx.supabase
          .from("contacts").select("id").eq("owner_id", ctx.userId)
          .ilike("name", `%${str(input.contactName)}%`).limit(1).maybeSingle();
        contactId = data?.id ?? null;
      }
      const { error } = await ctx.supabase.from("deals").insert({
        owner_id: ctx.userId, title, contact_id: contactId,
        value: num(input.value), stage: str(input.stage) || "Qualified", note: str(input.note) || null,
      });
      if (error) return { summary: error.message, isError: true };
      return { summary: `Obchod "${title}" vytvorený.` };
    },
  },

  crm_note: {
    requires: "crm",
    schema: {
      name: "crm_note",
      description:
        "Write what you learned into the CRM so the knowledge survives this run (e.g. research findings about a company, why an approach failed).",
      input_schema: {
        type: "object",
        properties: {
          contactName: { type: "string" },
          note: { type: "string", description: "The finding, written so a human can use it." },
        },
        required: ["contactName", "note"],
      },
    },
    run: async (ctx, input) => {
      const name = str(input.contactName);
      const note = str(input.note);
      const { data: contact } = await ctx.supabase
        .from("contacts").select("id,name").eq("owner_id", ctx.userId)
        .ilike("name", `%${name}%`).limit(1).maybeSingle();
      if (!contact) return { summary: `Kontakt "${name}" sa nenašiel.`, isError: true };

      const { data: deal } = await ctx.supabase
        .from("deals").select("id,note").eq("owner_id", ctx.userId)
        .eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (deal) {
        const merged = [deal.note, `[agent] ${note}`].filter(Boolean).join("\n");
        await ctx.supabase.from("deals").update({ note: merged }).eq("id", deal.id);
        return { summary: `Poznámka zapísaná k obchodu kontaktu ${contact.name}.` };
      }
      await ctx.supabase.from("tasks").insert({
        owner_id: ctx.userId, agent_id: ctx.agentId,
        title: `Zistenie o ${contact.name}: ${note}`, state: "me",
      });
      return { summary: `Kontakt nemá obchod — zistenie uložené ako úloha pre teba.` };
    },
  },

  create_task: {
    requires: "crm",
    schema: {
      name: "create_task",
      description: "Create a task on the board. Use 'me' when it genuinely needs a human decision.",
      input_schema: {
        type: "object",
        properties: { title: { type: "string" }, state: { type: "string", enum: ["ai", "me"] } },
        required: ["title", "state"],
      },
    },
    run: async (ctx, input) => {
      const title = str(input.title);
      if (!title) return { summary: "Chýba text úlohy.", isError: true };
      const { error } = await ctx.supabase.from("tasks").insert({
        owner_id: ctx.userId, agent_id: ctx.agentId, title,
        state: input.state === "me" ? "me" : "ai",
      });
      if (error) return { summary: error.message, isError: true };
      return { summary: `Úloha vytvorená: "${title}"` };
    },
  },

  // ---------------- OUTPUT THAT A HUMAN MUST APPROVE ----------------
  draft_message: {
    requires: "crm",
    schema: {
      name: "draft_message",
      description:
        "Save a finished draft (email, comment, DM, ad copy) for human approval. This does NOT send anything — sending needs a connected channel. Use it as the deliverable of a writing step.",
      input_schema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "comment", "dm", "ad", "other"] },
          contactName: { type: "string" },
          content: { type: "string", description: "The full text, ready to send as-is." },
        },
        required: ["channel", "content"],
      },
    },
    run: async (ctx, input) => {
      const content = str(input.content);
      if (!content) return { summary: "Prázdny text.", isError: true };
      let contactId: string | null = null;
      if (str(input.contactName)) {
        const { data } = await ctx.supabase
          .from("contacts").select("id").eq("owner_id", ctx.userId)
          .ilike("name", `%${str(input.contactName)}%`).limit(1).maybeSingle();
        contactId = data?.id ?? null;
      }
      await ctx.supabase.from("agent_runs").update({ contact_id: contactId }).eq("id", ctx.runId).is("contact_id", null);
      await ctx.supabase.from("run_steps").insert({
        owner_id: ctx.userId, run_id: ctx.runId, step_no: 99,
        label: `Návrh (${str(input.channel) || "text"}) pripravený na schválenie`, status: "done", detail: content,
      });
      return { summary: `Návrh uložený a zaradený na schválenie:\n\n${content}` };
    },
  },

  // ---------------- HONEST BLOCKING ----------------
  report_blocked: {
    requires: "crm",
    schema: {
      name: "report_blocked",
      description:
        "Call this when the step CANNOT be truly completed because a channel/tool is not connected (e.g. sending email, posting on X, reading ad metrics). Never pretend an action happened. Say exactly what is missing and what the human must connect.",
      input_schema: {
        type: "object",
        properties: {
          missingTool: { type: "string", description: "e.g. email, x, linkedin, ads, analytics" },
          whatWasDone: { type: "string", description: "What you DID manage to prepare before hitting the wall." },
          hint: { type: "string", description: "Concrete instruction for the human to unblock it." },
        },
        required: ["missingTool", "hint"],
      },
    },
    run: async (ctx, input) => {
      const missing = str(input.missingTool);
      const hint = str(input.hint);
      await ctx.supabase.from("run_steps").insert({
        owner_id: ctx.userId, run_id: ctx.runId, step_no: 98,
        label: `Zablokované — chýba napojenie: ${missing}`, status: "blocked", detail: hint,
      });
      return {
        summary: `Krok je zablokovaný, chýba: ${missing}. ${str(input.whatWasDone) || ""}`,
        blocked: { tool: missing, hint },
      };
    },
  },
};

/** Which of our tools the model may see, given what is actually connected. */
export function toolsForConnectors(connected: Set<string>): Anthropic.Tool[] {
  return Object.values(AGENT_TOOLS)
    .filter((t) => connected.has(t.requires))
    .map((t) => t.schema);
}
