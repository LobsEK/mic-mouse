"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import AuthLayout from "@/components/auth/AuthLayout";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <AuthLayout>
      <div className="auth-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff6a1f">
          <path d="M13 2 4 13h6l-1 9 9-11h-6z" />
        </svg>
      </div>

      <h1 className="auth-title">Prihlás sa do Mic Mouse</h1>
      <p className="auth-sub">Vitaj späť.</p>

      <form action={formAction}>
        {state?.error && (
          <div className="auth-error">
            <span>{state.error}</span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required
            placeholder="meno@instaview.sk" autoComplete="email" autoFocus />
        </div>

        <div className="auth-field">
          <label htmlFor="password">Heslo</label>
          <input id="password" name="password" type="password" required
            placeholder="••••••••" autoComplete="current-password" />
        </div>

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Prihlasujem…" : "Pokračovať"}
        </button>
      </form>

      <p className="auth-alt">
        Nemáš účet? <Link href="/signup">Vytvor si ho</Link>
      </p>
    </AuthLayout>
  );
}
