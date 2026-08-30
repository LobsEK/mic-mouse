import type { ReactNode } from "react";

/**
 * Split sign-in screen: the left panel makes the case for the product,
 * the right panel gets out of the way and lets you in.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <aside className="auth-pitch">
        <div className="auth-pitch-top">
          <div className="auth-eyebrow">Agenti, ktorí naozaj pracujú</div>
          <ul className="auth-points">
            <li>Vidíš, čo agent práve robí, krok po kroku</li>
            <li>Keď niečo nemôže dokončiť, povie prečo</li>
            <li>Po každom kroku navrhne dva ďalšie</li>
            <li>Pri každom kroku vieš, čo stál</li>
          </ul>

          <p className="auth-lead">
            Agent, ktorý robí marketing za teba: sleduje kampane, drží čísla pokope
            a pripraví ti ich tak, aby si sa vedel rozhodnúť. Všetko na jednom mieste —
            nestrácaš pozornosť prepínaním medzi nástrojmi.
          </p>
        </div>

        <div className="auth-pitch-foot">
          <p className="auth-claim">
            Agent si dohľadá informácie o firme, pripraví oslovenie a zapíše zistenia do CRM.
            Odoslanie necháva na teba — nič sa neodošle bez tvojho schválenia.
          </p>
          <div className="auth-facts">
            <span>Dáta v tvojej vlastnej databáze</span>
            <span>API kľúč len na serveri</span>
            <span>Každý beh má cenu v eurách</span>
          </div>
        </div>
      </aside>

      <main className="auth-form-side">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
