"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-sunken)",
        padding: 24,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: "36px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div className="logo">
            <svg style={{ width: 14, height: 14, fill: "var(--amber)" }} viewBox="0 0 24 24">
              <path d="M13 2 4 13h6l-1 9 9-11h-6z" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Mic Mouse</div>
            <div className="brand-sub">Agent Studio · Instaview</div>
          </div>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 650, margin: "0 0 4px" }}>Prihlásenie</h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px" }}>
          Prístup len pre pozvaných členov tímu.
        </p>

        <form action={formAction} className="if-grid" style={{ gridTemplateColumns: "1fr", gap: 14 }}>
          <label>
            E-mail
            <input name="email" type="email" required placeholder="ty@instaview.sk" autoComplete="email" />
          </label>
          <label>
            Heslo
            <input name="password" type="password" required placeholder="••••••••" autoComplete="current-password" />
          </label>

          {state?.error && (
            <div className="note warn" style={{ fontSize: 12.5 }}>
              <span>{state.error}</span>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
            {pending ? "Prihlasujem…" : "Prihlásiť sa"}
          </button>
        </form>

        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 18, textAlign: "center" }}>
          Nemáš účet? <Link href="/signup" style={{ color: "var(--accent)", fontWeight: 600 }}>Vytvoriť účet</Link>
        </p>
      </div>
    </div>
  );
}
