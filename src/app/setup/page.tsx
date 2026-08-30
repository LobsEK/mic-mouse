import { missingEnv, supabaseConfigured } from "@/lib/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = missingEnv();
  if (supabaseConfigured() && missing.length === 0) redirect("/");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-sunken)", padding: 24 }}>
      <div className="card" style={{ maxWidth: 620, padding: "34px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div className="logo">
            <svg style={{ width: 14, height: 14, fill: "var(--amber)" }} viewBox="0 0 24 24"><path d="M13 2 4 13h6l-1 9 9-11h-6z" /></svg>
          </div>
          <div>
            <div className="brand-name">Mic Mouse</div>
            <div className="brand-sub">Agent Studio · Instaview</div>
          </div>
        </div>

        <h1 style={{ fontSize: 19, fontWeight: 650, margin: "0 0 6px" }}>Ešte chýbajú prístupy</h1>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 0 }}>
          Aplikácia je nasadená a beží. Aby fungovalo prihlásenie, databáza a agenti, treba doplniť tieto
          premenné vo Vercel → <b>Project → Settings → Environment Variables</b>, a potom dať Redeploy.
        </p>

        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
          <table>
            <thead><tr><th>Premenná</th><th>Kde ju vezmeš</th></tr></thead>
            <tbody>
              {missing.map((m) => (
                <tr key={m}>
                  <td className="mono" style={{ fontSize: 12 }}>{m}</td>
                  <td style={{ fontSize: 12.5 }}>{WHERE[m] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="note info">
          <span>
            V Supabase treba ešte raz spustiť SQL z <span className="mono">supabase/migrations/0001_init.sql</span> a
            <span className="mono"> 0002_agent_engine.sql</span> (SQL Editor → vložiť → Run). Tým vzniknú tabuľky.
          </span>
        </div>
      </div>
    </div>
  );
}

const WHERE: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase → Settings → API → Project URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase → Settings → API → anon public",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase → Settings → API → service_role (tajný)",
  ANTHROPIC_API_KEY: "console.anthropic.com → API Keys",
};
