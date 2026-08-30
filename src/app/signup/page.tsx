"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);

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

        <h1 style={{ fontSize: 18, fontWeight: 650, margin: "0 0 4px" }}>Vytvoriť účet</h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px" }}>
          Heslo musí mať aspoň 8 znakov.
        </p>

        <form action={formAction} className="if-grid" style={{ gridTemplateColumns: "1fr", gap: 14 }}>
          <label>
            E-mail
            <input name="email" type="email" required placeholder="ty@instaview.sk" autoComplete="email" />
          </label>
          <label>
            Heslo
            <input name="password" type="password" required minLength={8} placeholder="••••••••" autoComplete="new-password" />
          </label>

          {state?.error && (
            <div className="note warn" style={{ fontSize: 12.5 }}>
              <span>{state.error}</span>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
            {pending ? "Vytváram účet…" : "Vytvoriť účet"}
          </button>
        </form>

        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 18, textAlign: "center" }}>
          Už máš účet? <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>Prihlásiť sa</Link>
        </p>
      </div>
    </div>
  );
}
