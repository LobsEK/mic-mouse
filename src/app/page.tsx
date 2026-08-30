import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { ensureConnectors } from "@/lib/agents/engine";
import AppShell from "@/components/AppShell";
import type {
  AgentEvent, AgentFull, Connector, Contact, Deal, RunFull, RunStep, Settings, Task, TaskProposal,
} from "@/lib/types";

// Always render fresh: agents change state while the user watches.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId, email } = await verifySession();
  await ensureConnectors(userId);
  const supabase = await createClient();

  const [
    { data: contacts }, { data: deals }, { data: tasks }, { data: agents },
    { data: runs }, { data: settings }, { data: proposals }, { data: events },
    { data: connectors },
  ] = await Promise.all([
    supabase.from("contacts").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("deals").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("agents").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("agent_runs").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(60),
    supabase.from("settings").select("*").eq("owner_id", userId).maybeSingle(),
    supabase.from("task_proposals").select("*").eq("owner_id", userId)
      .in("status", ["proposed", "blocked"]).order("created_at", { ascending: false }).limit(40),
    supabase.from("agent_events").select("*").eq("owner_id", userId)
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("connectors").select("*").eq("owner_id", userId).order("created_at", { ascending: true }),
  ]);

  const runIds = (runs ?? []).slice(0, 12).map((r) => r.id);
  const { data: steps } = runIds.length
    ? await supabase.from("run_steps").select("*").in("run_id", runIds).order("step_no", { ascending: true })
    : { data: [] as RunStep[] };

  return (
    <AppShell
      userEmail={email}
      contacts={(contacts as Contact[]) ?? []}
      deals={(deals as Deal[]) ?? []}
      tasks={(tasks as Task[]) ?? []}
      agents={(agents as AgentFull[]) ?? []}
      runs={(runs as RunFull[]) ?? []}
      steps={(steps as RunStep[]) ?? []}
      proposals={(proposals as TaskProposal[]) ?? []}
      events={(events as AgentEvent[]) ?? []}
      connectors={(connectors as Connector[]) ?? []}
      settings={(settings as Settings | null) ?? null}
    />
  );
}
