import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/dal";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { draftFollowupForContact } from "@/lib/agents/salesFollowup";
import { runAgentStep } from "@/lib/agents/engine";
import { formatEur } from "@/lib/agents/costs";

export const runtime = "nodejs";

type IncomingMessage = { role: "user" | "assistant"; content: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_task",
    description: "Create a task in the user's task board.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What needs to happen." },
        state: {
          type: "string",
          enum: ["ai", "me"],
          description: "'ai' if an agent should do it, 'me' if it's for the human.",
        },
      },
      required: ["title", "state"],
    },
  },
  {
    name: "create_contact",
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
  {
    name: "create_deal",
    description: "Create a new sales deal, optionally linked to an existing contact by name.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        contactName: { type: "string", description: "Name of an existing contact to link, if any." },
        value: { type: "number" },
        stage: { type: "string", enum: ["Qualified", "Proposal", "Negotiation", "Won", "Lost"] },
        note: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "agent_status",
    description:
      "Report on the user's agents: which are working, which are blocked or errored, what each is missing, budget spent. Use this whenever the user asks how the agents are doing, what is running, or why something is not working.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_agent",
    description:
      "Actually start an agent on a concrete task right now. The agent does real work and afterwards proposes two follow-up steps. Use when the user asks you to make an agent do something.",
    input_schema: {
      type: "object",
      properties: {
        agentName: { type: "string", description: "Name of an existing agent." },
        task: { type: "string", description: "Concrete instruction for this run." },
      },
      required: ["agentName"],
    },
  },
  {
    name: "draft_followup_email",
    description:
      "Have the Sales agent draft a real follow-up email for a contact using their CRM data. The draft is saved and requires human approval before sending — this tool does not send anything.",
    input_schema: {
      type: "object",
      properties: {
        contactName: { type: "string", description: "Name of the contact to draft a follow-up for." },
      },
      required: ["contactName"],
    },
  },
];

export async function POST(req: Request) {
  const { userId } = await verifySession();
  const body = await req.json();
  const messages: IncomingMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: contacts }, { data: deals }, { data: tasks }, { data: agents }] = await Promise.all([
    supabase.from("contacts").select("id,name,company,role,tags").eq("owner_id", userId).limit(40),
    supabase.from("deals").select("id,title,stage,value,contact_id").eq("owner_id", userId).limit(40),
    supabase.from("tasks").select("id,title,state").eq("owner_id", userId).neq("state", "done").limit(40),
    supabase.from("agents").select("id,name,kind,status").eq("owner_id", userId).limit(20),
  ]);

  const systemPrompt = `Si Apollo, nadriadený agent v Agent Studio pre Instaview. Dozeráš na ostatných agentov a máš skutočný prístup vykonávať akcie cez nástroje — keď niečo prisľúbiš, naozaj to urob cez nástroj, nikdy to nepredstieraj.
Keď sa ťa používateľ pýta na stav, chod alebo problémy agentov, VŽDY najprv zavolaj agent_status a odpovedz z reálnych čísel.
Vždy zvažuj výkon vs. náklad: ak sa nejaký krok neoplatí (opakovane bez odpovede, malá firma, nízky dopad), povedz to a navrhni inú stratégiu.
Odpovedaj stručne, vecne, v jazyku používateľa (predvolene slovenčina).

Aktuálny stav pracovného priestoru (JSON):
Kontakty: ${JSON.stringify(contacts ?? [])}
Obchody: ${JSON.stringify(deals ?? [])}
Otvorené úlohy: ${JSON.stringify(tasks ?? [])}
Agenti: ${JSON.stringify(agents ?? [])}`;

  const anthropic = getAnthropic();
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const actionsPerformed: { tool: string; summary: string }[] = [];

  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: convo,
    });

    convo.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content.find((b) => b.type === "text")?.text ?? "";
      return NextResponse.json({ reply: text, actions: actionsPerformed });
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeTool(userId, block.name, block.input as Record<string, unknown>);
      actionsPerformed.push({ tool: block.name, summary: result.summary });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.summary,
        is_error: result.isError,
      });
    }
    convo.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({
    reply: "Spravil som niekoľko krokov, ale potrebujem, aby si spresnil ďalší krok.",
    actions: actionsPerformed,
  });
}

async function executeTool(
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<{ summary: string; isError?: boolean }> {
  const supabase = await createClient();

  try {
    switch (name) {
      case "create_task": {
        const title = String(input.title || "").trim();
        const state = input.state === "me" ? "me" : "ai";
        if (!title) return { summary: "Chýba text úlohy.", isError: true };
        const { error } = await supabase.from("tasks").insert({ owner_id: userId, title, state });
        if (error) return { summary: error.message, isError: true };
        return { summary: `Úloha vytvorená: "${title}"` };
      }
      case "create_contact": {
        const name_ = String(input.name || "").trim();
        if (!name_) return { summary: "Chýba meno kontaktu.", isError: true };
        const { error } = await supabase.from("contacts").insert({
          owner_id: userId,
          name: name_,
          company: (input.company as string) || null,
          role: (input.role as string) || null,
          email: (input.email as string) || null,
          phone: (input.phone as string) || null,
        });
        if (error) return { summary: error.message, isError: true };
        return { summary: `Kontakt vytvorený: ${name_}` };
      }
      case "create_deal": {
        const title = String(input.title || "").trim();
        if (!title) return { summary: "Chýba názov obchodu.", isError: true };
        let contactId: string | null = null;
        if (input.contactName) {
          const { data } = await supabase
            .from("contacts")
            .select("id")
            .eq("owner_id", userId)
            .ilike("name", `%${input.contactName}%`)
            .limit(1)
            .maybeSingle();
          contactId = data?.id ?? null;
        }
        const { error } = await supabase.from("deals").insert({
          owner_id: userId,
          title,
          contact_id: contactId,
          value: (input.value as number) || 0,
          stage: (input.stage as string) || "Qualified",
          note: (input.note as string) || null,
        });
        if (error) return { summary: error.message, isError: true };
        return { summary: `Obchod vytvorený: "${title}"` };
      }
      case "agent_status": {
        const [{ data: agents }, { data: connectors }, { data: proposals }] = await Promise.all([
          supabase.from("agents").select("name,kind,health,current_activity,last_error,last_error_hint,required_tools,tokens_used,token_budget,cost_eur,autopilot").eq("owner_id", userId),
          supabase.from("connectors").select("key,status").eq("owner_id", userId),
          supabase.from("task_proposals").select("title,verdict,est_cost_eur").eq("owner_id", userId).eq("status", "proposed"),
        ]);
        const notConnected = (connectors ?? []).filter((c) => c.status !== "connected").map((c) => c.key);
        return {
          summary: JSON.stringify({
            agents: (agents ?? []).map((a) => ({
              ...a,
              chyba_napojenie: (a.required_tools ?? []).filter((t: string) => notConnected.includes(t)),
            })),
            nenapojene_kanaly: notConnected,
            otvorene_navrhy: proposals ?? [],
          }),
        };
      }
      case "run_agent": {
        const agentName = String(input.agentName || "").trim();
        const { data: agent } = await supabase
          .from("agents").select("id,name,goal,config").eq("owner_id", userId)
          .ilike("name", `%${agentName}%`).limit(1).maybeSingle();
        if (!agent) return { summary: `Agent "${agentName}" sa nenašiel.`, isError: true };
        const task =
          String(input.task || "").trim() ||
          agent.goal ||
          (typeof agent.config?.instructions === "string" ? agent.config.instructions : "") ||
          "Urob najužitočnejší ďalší krok vo svojej oblasti.";
        const outcome = await runAgentStep({
          userId, agentId: agent.id, title: task.split("\n")[0].slice(0, 90), instruction: task,
        });
        return {
          summary: `Agent ${agent.name} dobehol so stavom "${outcome.status}" (${formatEur(outcome.costEur)}).\n${outcome.output}` +
            (outcome.blocked ? `\nZABLOKOVANÉ: chýba ${outcome.blocked.tool} — ${outcome.blocked.hint}` : ""),
        };
      }
      case "draft_followup_email": {
        const contactName = String(input.contactName || "").trim();
        const { data: contact } = await supabase
          .from("contacts")
          .select("id,name")
          .eq("owner_id", userId)
          .ilike("name", `%${contactName}%`)
          .limit(1)
          .maybeSingle();
        if (!contact) return { summary: `Kontakt "${contactName}" sa nenašiel.`, isError: true };
        const { draft } = await draftFollowupForContact(userId, contact.id);
        return {
          summary: `Návrh follow-up e-mailu pre ${contact.name} je pripravený a čaká na schválenie v Approvals:\n\n${draft}`,
        };
      }
      default:
        return { summary: `Neznámy nástroj: ${name}`, isError: true };
    }
  } catch (e) {
    return { summary: e instanceof Error ? e.message : String(e), isError: true };
  }
}
