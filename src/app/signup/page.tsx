"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import AuthLayout from "@/components/auth/AuthLayout";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <AuthLayout>
      <div className="auth-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff6a1f">
          <path d="M13 2 4 13h6l-1 9 9-11h-6z" />
        </svg>
      </div>

      <h1 className="auth-title">Vytvor si účet</h1>
      <p className="auth-sub">Chvíľu to potrvá, potom už len pracuješ.</p>

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
          <input id="password" name="password" type="password" required minLength={8}
            placeholder="aspoň 8 znakov" autoComplete="new-password" />
        </div>

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Vytváram účet…" : "Vytvoriť účet"}
        </button>
      </form>

      <p className="auth-alt">
        Už máš účet? <Link href="/login">Prihlás sa</Link>
      </p>
    </AuthLayout>
  );
}
