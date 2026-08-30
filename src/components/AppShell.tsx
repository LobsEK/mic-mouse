"use client";

import { useMemo, useState } from "react";
import IconSprite from "@/components/IconSprite";
import { logout } from "@/app/actions/auth";
import AgentsView from "@/components/views/AgentsView";
import TasksView from "@/components/views/TasksView";
import ApprovalsView from "@/components/views/ApprovalsView";
import ProposalsView from "@/components/views/ProposalsView";
import SalesView from "@/components/views/SalesView";
import PlaceholderView from "@/components/views/PlaceholderView";
import SettingsView from "@/components/views/SettingsView";
import Apollo from "@/components/Apollo";
import type {
  AgentEvent, AgentFull, Connector, Contact, Deal, RunFull, RunStep, Settings, Task, TaskProposal,
} from "@/lib/types";

type ViewId =
  | "v-agents" | "v-tasks" | "v-next" | "v-requests"
  | "v-sales" | "v-ads" | "v-marketing" | "v-pulse" | "v-settings";

const NAV: { id: ViewId; label: string; icon: string; group: string }[] = [
  { id: "v-agents", label: "Agents", icon: "i-agents", group: "Work" },
  { id: "v-tasks", label: "Tasks", icon: "i-inbox", group: "Work" },
  { id: "v-next", label: "Ďalšie kroky", icon: "i-spark", group: "Work" },
  { id: "v-requests", label: "Approvals", icon: "i-check", group: "Work" },
  { id: "v-sales", label: "Sales", icon: "i-chart", group: "Growth" },
  { id: "v-ads", label: "Ads", icon: "i-pulse", group: "Growth" },
  { id: "v-marketing", label: "Marketing", icon: "i-spark", group: "Growth" },
  { id: "v-pulse", label: "Pulse", icon: "i-pulse", group: "Insight" },
  { id: "v-settings", label: "Settings", icon: "i-plug", group: "Resources" },
];

const TITLES: Record<ViewId, string> = {
  "v-agents": "Agents", "v-tasks": "Tasks", "v-next": "Ďalšie kroky", "v-requests": "Approvals",
  "v-sales": "Sales", "v-ads": "Ads", "v-marketing": "Marketing", "v-pulse": "Pulse", "v-settings": "Settings",
};

export default function AppShell({
  userEmail, contacts, deals, tasks, agents, runs, steps, proposals, events, connectors, settings,
}: {
  userEmail: string;
  contacts: Contact[]; deals: Deal[]; tasks: Task[];
  agents: AgentFull[]; runs: RunFull[]; steps: RunStep[];
  proposals: TaskProposal[]; events: AgentEvent[]; connectors: Connector[];
  settings: Settings | null;
}) {
  const [view, setView] = useState<ViewId>("v-agents");

  const openTaskCount = useMemo(() => tasks.filter((t) => t.state !== "done").length, [tasks]);
  const pendingApprovalCount = useMemo(() => runs.filter((r) => r.status === "needs_approval").length, [runs]);
  const openProposals = useMemo(() => proposals.filter((p) => p.status === "proposed").length, [proposals]);
  const troubled = useMemo(
    () => agents.filter((a) => a.health === "blocked" || a.health === "error").length,
    [agents]
  );

  const groups = ["Work", "Growth", "Insight", "Resources"];
  const initials = userEmail.split("@")[0].slice(0, 2).toUpperCase() || "??";

  return (
    <div className="app">
      <IconSprite />

      <aside className="sidebar">
        <div className="sb-top"><span className="sb-top-label">Menu</span></div>

        <div className="sb-pad" style={{ paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="logo">
              <svg style={{ width: 14, height: 14, fill: "var(--amber)" }} viewBox="0 0 24 24">
                <path d="M13 2 4 13h6l-1 9 9-11h-6z" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="brand-name">Mic Mouse</div>
              <div className="brand-sub">Instaview</div>
            </div>
          </div>
        </div>

        <nav className="nav">
          {groups.map((group) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {NAV.filter((n) => n.group === group).map((n) => (
                <button
                  key={n.id}
                  className={`nav-item${view === n.id ? " active" : ""}`}
                  onClick={() => setView(n.id)}
                >
                  <svg><use href={`#${n.icon}`} /></svg>
                  <span>{n.label}</span>
                  {n.id === "v-tasks" && openTaskCount > 0 && <span className="count">{openTaskCount}</span>}
                  {n.id === "v-next" && openProposals > 0 && <span className="count">{openProposals}</span>}
                  {n.id === "v-requests" && pendingApprovalCount > 0 && <span className="count">{pendingApprovalCount}</span>}
                  {n.id === "v-agents" && (
                    <span className="count" style={troubled ? { background: "#fff5e0", color: "#8a5b00" } : undefined}>
                      {troubled ? `${troubled}!` : agents.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="user">
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{userEmail.split("@")[0]}</div>
              <div className="user-mail">{userEmail}</div>
            </div>
          </div>
          <form action={logout}>
            <button className="ghost" type="submit" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
              Odhlásiť sa
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="crumb">Workspace</div>
            <h1 className="h1">{TITLES[view]}</h1>
          </div>
        </div>

        <div className="content">
          {view === "v-agents" && <AgentsView agents={agents} runs={runs} steps={steps} connectors={connectors} />}
          {view === "v-tasks" && <TasksView tasks={tasks} agents={agents} />}
          {view === "v-next" && <ProposalsView proposals={proposals} agents={agents} connectors={connectors} />}
          {view === "v-requests" && <ApprovalsView runs={runs} contacts={contacts} agents={agents} steps={steps} />}
          {view === "v-sales" && <SalesView contacts={contacts} deals={deals} />}
          {view === "v-ads" && (
            <PlaceholderView
              title="Ads"
              note="Reklamné platformy zatiaľ nie sú napojené. Agent vie kampaň naozaj naplánovať a napísať texty — spustenie a meranie potrebuje napojenie, ktoré nájdeš v Settings."
            />
          )}
          {view === "v-marketing" && (
            <PlaceholderView
              title="Marketing"
              note="Marketingový agent už funguje cez Agents — vie si dohľadať informácie na webe, pripraviť oslovenia a sám navrhnúť ďalšie kroky. Odosielanie e-mailov a príspevky na sieťach čakajú na napojenie kanálov."
            />
          )}
          {view === "v-pulse" && (
            <PlaceholderView
              title="Pulse"
              note="Reálne metriky dosahu potrebujú napojenú analytiku (GA4). Náklady a spotrebu tokenov jednotlivých agentov vidíš zatiaľ priamo na ich kartách v Agents."
            />
          )}
          {view === "v-settings" && <SettingsView settings={settings} connectors={connectors} />}
        </div>
      </main>

      <Apollo events={events} onGoToAgents={() => setView("v-agents")} />
    </div>
  );
}
