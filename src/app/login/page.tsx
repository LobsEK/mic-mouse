"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import AuthLayout from "@/components/auth/AuthLayout";
import ApolloOrb from "@/components/ApolloOrb";

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const linkError = useSearchParams().get("error");

  return (
    <AuthLayout>
      <div className="auth-orb">
        <ApolloOrb size={58} state="idle" />
      </div>

      <h1 className="auth-title">Prihlás sa do Mic Mouse</h1>
      <p className="auth-sub">Vitaj späť.</p>

      <form action={formAction}>
        {(state?.error || linkError) && (
          <div className="auth-error">
            <span>{state?.error ?? linkError}</span>
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
