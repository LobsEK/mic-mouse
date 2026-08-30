export type Contact = {
  id: string;
  owner_id: string;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  created_at: string;
};

export type Deal = {
  id: string;
  owner_id: string;
  contact_id: string | null;
  title: string;
  value: number;
  stage: "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";
  close_date: string | null;
  note: string | null;
  created_at: string;
};

export type AgentKind = "sales" | "ads" | "marketing" | "support";

export type Agent = {
  id: string;
  owner_id: string;
  name: string;
  kind: AgentKind;
  status: "active" | "paused";
  config: Record<string, unknown>;
  created_at: string;
};

export type Task = {
  id: string;
  owner_id: string;
  agent_id: string | null;
  title: string;
  state: "ai" | "me" | "done";
  due: string | null;
  created_at: string;
};

export type AgentRunStatus =
  | "pending" | "running" | "needs_approval" | "approved"
  | "rejected" | "failed" | "blocked" | "done";

export type AgentRun = {
  id: string;
  owner_id: string;
  agent_id: string;
  contact_id: string | null;
  input: Record<string, unknown>;
  output: string | null;
  model: string | null;
  status: AgentRunStatus;
  error: string | null;
  created_at: string;
  decided_at: string | null;
};

export type Settings = {
  owner_id: string;
  company_name: string;
  sender_name: string | null;
  tone: string;
  updated_at: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// ================= AGENT ENGINE =================

export type ConnectorKey = "crm" | "web" | "email" | "linkedin" | "x" | "ads" | "analytics";

export type Connector = {
  id: string;
  owner_id: string;
  key: ConnectorKey | string;
  label: string;
  status: "connected" | "not_connected" | "error" | "unavailable";
  detail: string | null;
  config: Record<string, unknown>;
  created_at: string;
};

export type AgentHealth = "idle" | "working" | "blocked" | "error";

export type AgentFull = Agent & {
  autopilot: boolean;
  required_tools: string[];
  goal: string | null;
  health: AgentHealth;
  last_run_at: string | null;
  last_error: string | null;
  last_error_hint: string | null;
  current_activity: string | null;
  token_budget: number;
  tokens_used: number;
  cost_eur: number;
};

export type RunStep = {
  id: string;
  owner_id: string;
  run_id: string;
  step_no: number;
  label: string;
  status: "running" | "done" | "failed" | "blocked";
  detail: string | null;
  created_at: string;
};

export type RunFull = AgentRun & {
  title: string | null;
  kind: string;
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
  autopilot_depth: number;
  parent_proposal_id: string | null;
  blocked_reason: string | null;
  finished_at: string | null;
};

export type Verdict = "worth" | "borderline" | "not_worth";

export type TaskProposal = {
  id: string;
  owner_id: string;
  agent_id: string;
  parent_run_id: string | null;
  title: string;
  rationale: string | null;
  expected_outcome: string | null;
  est_tokens: number;
  est_cost_eur: number;
  impact: number;
  effort: number;
  verdict: Verdict;
  verdict_reason: string | null;
  requires_tools: string[];
  status: "proposed" | "accepted" | "dismissed" | "executed" | "blocked";
  created_at: string;
  decided_at: string | null;
};

export type AgentEvent = {
  id: string;
  owner_id: string;
  agent_id: string | null;
  run_id: string | null;
  level: "info" | "warn" | "error";
  message: string;
  hint: string | null;
  created_at: string;
  seen_at: string | null;
};

export type Briefing = {
  id: string;
  owner_id: string;
  content: string;
  stats: Record<string, number>;
  created_at: string;
  seen_at: string | null;
};
