"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "@/app/actions/settings";
import type { Connector, Settings } from "@/lib/types";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  connected: { label: "napojené", bg: "var(--accent-soft)", fg: "var(--accent)" },
  not_connected: { label: "nenapojené", bg: "var(--line-soft)", fg: "var(--ink-3)" },
  error: { label: "chyba", bg: "var(--red-soft)", fg: "var(--red)" },
  unavailable: { label: "nedostupné", bg: "var(--line-soft)", fg: "var(--ink-3)" },
};

export default function SettingsView({
  settings, connectors,
}: {
  settings: Settings | null; connectors: Connector[];
}) {
  const [companyName, setCompanyName] = useState(settings?.company_name ?? "Instaview");
  const [senderName, setSenderName] = useState(settings?.sender_name ?? "");
  const [tone, setTone] = useState(settings?.tone ?? "friendly, concise, professional");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="sec-title" style={{ marginTop: 0 }}>Ako agenti píšu</div>
      <p style={{ fontSize: 12.8, color: "var(--ink-3)", marginTop: -6 }}>
        Toto naozaj ovplyvňuje každý text, ktorý agent cez Claude napíše.
      </p>
      <div className="card" style={{ padding: 18 }}>
        <div className="if-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label>Názov firmy<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></label>
          <label>Podpisovať ako<input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="napr. Luboš" /></label>
          <label>Tón komunikácie<input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
        </div>
        <div className="if-btns">
          <button className="btn-primary" disabled={pending}
            onClick={() => startTransition(async () => { await saveSettings({ companyName, senderName, tone }); setSaved(true); })}>
            {pending ? "Ukladám…" : "Uložiť"}
          </button>
          {saved && <span style={{ fontSize: 12.5, color: "var(--accent)" }}>Uložené.</span>}
        </div>
      </div>

      <div className="sec-title">Čo agenti naozaj vedia dosiahnuť</div>
      <div className="grid" style={{ gap: 10 }}>
        {connectors.map((c) => {
          const s = STATUS[c.status] ?? STATUS.not_connected;
          return (
            <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5 }}>{c.label}</div>
                {c.detail && <div style={{ fontSize: 12.3, color: "var(--ink-3)", marginTop: 2 }}>{c.detail}</div>}
              </div>
              <span className="pill" style={{ background: s.bg, color: s.fg, flex: "none" }}>{s.label}</span>
            </div>
          );
        })}
      </div>
      <div className="note info">
        <span>
          Toto je úmyselne poctivé: agent nikdy nepredstiera, že niečo odoslal. Ak kanál nie je napojený,
          prácu pripraví na schválenie a nahlási, čo mu chýba — uvidíš to na jeho karte aj v hlásení od Apolla.
        </span>
      </div>

      <div className="sec-title">Claude API</div>
      <div className="note info">
        <span>
          Kľúč beží len na serveri (Vercel → Environment Variables), nikdy sa neposiela do prehliadača.
          Spotrebu a cenu každého behu vidíš pri agentoch a v Approvals.
        </span>
      </div>
    </div>
  );
}
