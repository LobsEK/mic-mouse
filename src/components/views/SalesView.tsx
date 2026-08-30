"use client";

import { useMemo, useState, useTransition } from "react";
import { createContact, createDeal, deleteContact, deleteDeal, updateDealStage } from "@/app/actions/crm";
import { runSalesFollowup } from "@/app/actions/agents";
import type { Contact, Deal } from "@/lib/types";

const STAGES: Deal["stage"][] = ["Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export default function SalesView({ contacts, deals }: { contacts: Contact[]; deals: Deal[] }) {
  const [tab, setTab] = useState<"deals" | "contacts">("deals");
  const [dealForm, setDealForm] = useState(false);
  const [contactForm, setContactForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [followupLoadingId, setFollowupLoadingId] = useState<string | null>(null);

  const contactByName = new Map(contacts.map((c) => [c.name, c]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const kpis = useMemo(() => {
    const openDeals = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
    const pipeline = openDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const won = deals.filter((d) => d.stage === "Won").reduce((sum, d) => sum + Number(d.value || 0), 0);
    return [
      { label: "Otvorené obchody", val: String(openDeals.length) },
      { label: "Pipeline (€)", val: pipeline.toLocaleString("sk-SK") },
      { label: "Vyhraté (€)", val: won.toLocaleString("sk-SK") },
      { label: "Kontakty", val: String(contacts.length) },
    ];
  }, [deals, contacts]);

  function handleDealSave(form: HTMLFormElement) {
    const fd = new FormData(form);
    const contactName = String(fd.get("contact") || "").trim();
    startTransition(async () => {
      try {
        await createDeal({
          title: String(fd.get("title") || ""),
          contactId: contactByName.get(contactName)?.id ?? null,
          value: Number(fd.get("value") || 0),
          stage: String(fd.get("stage") || "Qualified"),
          closeDate: String(fd.get("close") || "") || undefined,
          note: String(fd.get("note") || ""),
        });
        form.reset();
        setDealForm(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleContactSave(form: HTMLFormElement) {
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        await createContact({
          name: String(fd.get("name") || ""),
          company: String(fd.get("company") || ""),
          role: String(fd.get("role") || ""),
          email: String(fd.get("email") || ""),
          phone: String(fd.get("phone") || ""),
        });
        form.reset();
        setContactForm(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleFollowup(contactId: string) {
    setFollowupLoadingId(contactId);
    setError(null);
    startTransition(async () => {
      try {
        await runSalesFollowup(contactId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setFollowupLoadingId(null);
      }
    });
  }

  return (
    <div>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="lbl">{k.label}</div>
            <div className="val">{k.val}</div>
          </div>
        ))}
      </div>

      <div className="sales-bar">
        <div className="tpl-tabs">
          <button className={`tpl-tab${tab === "deals" ? " active" : ""}`} onClick={() => setTab("deals")}>
            Deals
          </button>
          <button className={`tpl-tab${tab === "contacts" ? " active" : ""}`} onClick={() => setTab("contacts")}>
            Contacts
          </button>
        </div>
        <div className="sales-actions">
          <button className="btn-primary" onClick={() => setDealForm((v) => !v)}>
            Nový obchod
          </button>
          <button className="ghost" onClick={() => setContactForm((v) => !v)}>
            Nový kontakt
          </button>
        </div>
      </div>

      {error && (
        <div className="note warn">
          <span>{error}</span>
        </div>
      )}

      {dealForm && (
        <form
          className="inline-form"
          style={{ display: "block" }}
          onSubmit={(e) => {
            e.preventDefault();
            handleDealSave(e.currentTarget);
          }}
        >
          <div className="if-grid">
            <label>
              Deal
              <input name="title" placeholder="Nordwell — automation pilot" required />
            </label>
            <label>
              Kontakt
              <input name="contact" list="contact-names" placeholder="Martina Kovac" />
              <datalist id="contact-names">
                {contacts.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>
            <label>
              Hodnota (€)
              <input name="value" type="number" placeholder="12000" />
            </label>
            <label>
              Stage
              <select name="stage" defaultValue="Qualified">
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Close date
              <input name="close" type="date" />
            </label>
            <label>
              Poznámka
              <input name="note" placeholder="Čo to brzdí?" />
            </label>
          </div>
          <div className="if-btns">
            <button className="btn-primary" type="submit" disabled={pending}>
              Uložiť
            </button>
            <button className="ghost" type="button" onClick={() => setDealForm(false)}>
              Zrušiť
            </button>
          </div>
        </form>
      )}

      {contactForm && (
        <form
          className="inline-form"
          style={{ display: "block" }}
          onSubmit={(e) => {
            e.preventDefault();
            handleContactSave(e.currentTarget);
          }}
        >
          <div className="if-grid">
            <label>
              Meno
              <input name="name" placeholder="Martina Kovac" required />
            </label>
            <label>
              Firma
              <input name="company" placeholder="Nordwell" />
            </label>
            <label>
              Rola
              <input name="role" placeholder="Head of Ops" />
            </label>
            <label>
              E-mail
              <input name="email" type="email" placeholder="name@company.com" />
            </label>
            <label>
              Telefón
              <input name="phone" placeholder="+421 900 000 000" />
            </label>
          </div>
          <div className="if-btns">
            <button className="btn-primary" type="submit" disabled={pending}>
              Uložiť
            </button>
            <button className="ghost" type="button" onClick={() => setContactForm(false)}>
              Zrušiť
            </button>
          </div>
        </form>
      )}

      {tab === "deals" ? (
        <div className="grid" style={{ marginTop: 16 }}>
          {deals.length === 0 && (
            <div className="note info">
              <span>Zatiaľ žiadne obchody.</span>
            </div>
          )}
          {deals.map((d) => {
            const c = d.contact_id ? contactById.get(d.contact_id) : null;
            return (
              <div key={d.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{d.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {c ? c.name : "bez kontaktu"} · {Number(d.value).toLocaleString("sk-SK")} € {d.note ? `· ${d.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={d.stage}
                    onChange={(e) => startTransition(() => updateDealStage(d.id, e.target.value))}
                    style={{ fontSize: 12.5, padding: "6px 8px", border: "1px solid #e2e5ea", borderRadius: 7 }}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="ghost" onClick={() => startTransition(() => deleteDeal(d.id))}>
                    Zmazať
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid g2" style={{ marginTop: 16 }}>
          {contacts.length === 0 && (
            <div className="note info">
              <span>Zatiaľ žiadne kontakty.</span>
            </div>
          )}
          {contacts.map((c) => (
            <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 650 }}>{c.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {[c.role, c.company].filter(Boolean).join(" @ ")}
              </div>
              {c.email && <div style={{ fontSize: 12.5 }}>{c.email}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  className="btn-primary"
                  disabled={followupLoadingId === c.id}
                  onClick={() => handleFollowup(c.id)}
                  title="Sales agent naozaj vygeneruje follow-up e-mail cez Claude a uloží ho do Approvals"
                >
                  {followupLoadingId === c.id ? "Generujem…" : "Navrhnúť follow-up"}
                </button>
                <button className="ghost" onClick={() => startTransition(() => deleteContact(c.id))}>
                  Zmazať
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
