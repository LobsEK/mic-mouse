"use client";

import { useState, useTransition } from "react";
import { createTask, deleteTask, setTaskState } from "@/app/actions/crm";
import type { Agent, Task } from "@/lib/types";

const COLUMNS: { state: Task["state"]; label: string; hint: string }[] = [
  { state: "ai", label: "Robí AI", hint: "Agent na tom pracuje alebo čaká na schválenie výstupu." },
  { state: "me", label: "Na mne", hint: "Vyžaduje ľudské rozhodnutie alebo prácu." },
  { state: "done", label: "Hotovo", hint: "Dokončené úlohy." },
];

export default function TasksView({ tasks, agents }: { tasks: Task[]; agents: Agent[] }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const agentById = new Map(agents.map((a) => [a.id, a]));

  function add(state: "ai" | "me") {
    if (!text.trim()) return;
    startTransition(async () => {
      await createTask({ title: text, state });
      setText("");
    });
  }

  return (
    <div>
      <div className="sec-title">Tasks</div>
      <div className="task-new">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Čo treba spraviť? napr. Ozvi sa Fjord Retail ohľadom ads pilotu"
          onKeyDown={(e) => e.key === "Enter" && add("me")}
        />
        <button className="btn-primary" disabled={pending} onClick={() => add("ai")}>
          Dať AI
        </button>
        <button className="ghost" disabled={pending} onClick={() => add("me")}>
          Nechať na mňa
        </button>
      </div>

      <div className="task-cols">
        {COLUMNS.map((col) => (
          <div className="task-col" key={col.state}>
            <div className="task-col-head">
              <span>{col.label}</span>
              <span className="count">{tasks.filter((t) => t.state === col.state).length}</span>
            </div>
            <div className="task-col-hint">{col.hint}</div>
            {tasks
              .filter((t) => t.state === col.state)
              .map((t) => (
                <div className="card task-card" key={t.id}>
                  <div>{t.title}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {t.agent_id ? agentById.get(t.agent_id)?.name ?? "Agent" : "Ty"}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {col.state !== "done" && (
                        <button
                          className="ghost"
                          style={{ padding: "3px 8px", fontSize: 11.5 }}
                          onClick={() => startTransition(() => setTaskState(t.id, "done"))}
                        >
                          Hotovo
                        </button>
                      )}
                      <button
                        className="ghost"
                        style={{ padding: "3px 8px", fontSize: 11.5 }}
                        onClick={() => startTransition(() => deleteTask(t.id))}
                      >
                        Zmazať
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
