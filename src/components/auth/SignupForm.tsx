"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import ApolloOrb from "@/components/ApolloOrb";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <>
      <div className="auth-orb">
        <ApolloOrb size={58} state="idle" />
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
            placeholder="meno@instaview.sk" autoComplete="email" />
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
    </>
  );
}
