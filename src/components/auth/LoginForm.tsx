"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import ApolloOrb from "@/components/ApolloOrb";

export default function LoginForm({ linkError }: { linkError?: string }) {
  const [state, formAction, pending] = useActionState(login, undefined);
  const error = state?.error ?? linkError;

  return (
    <>
      <div className="auth-orb">
        <ApolloOrb size={58} state="idle" />
      </div>

      <h1 className="auth-title">Prihlás sa do Mic Mouse</h1>
      <p className="auth-sub">Vitaj späť.</p>

      <form action={formAction}>
        {error && (
          <div className="auth-error">
            <span>{error}</span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required
            placeholder="meno@instaview.sk" autoComplete="email" />
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
    </>
  );
}
