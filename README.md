# Mic Mouse — Agent Studio

Reálna webová appka (nie mockup): prihlásenie, databáza a agenti, ktorí naozaj volajú Claude API.

Stack: **Next.js 16** (App Router) · **Supabase** (Postgres + Auth) · **Vercel** (hosting) · **Anthropic Claude API** (server-side).

## 1. Lokálne spustenie

```bash
npm install
cp .env.example .env.local   # a doplň hodnoty (pozri nižšie)
npm run dev
```

Aplikácia beží na http://localhost:3000. Bez vyplneného `.env.local` appka nabehne, ale prihlásenie/DB/Claude volania zlyhajú.

## 2. Supabase (databáza + prihlasovanie)

1. Choď na [supabase.com](https://supabase.com) → **New project**.
2. Počkaj, kým sa projekt vytvorí (cca 2 min).
3. **SQL Editor** → vlož a spusti obsah súboru `supabase/migrations/0001_init.sql`. Vytvorí to tabuľky (`contacts`, `deals`, `agents`, `tasks`, `agent_runs`, `settings`) so zapnutým Row Level Security — každý používateľ vidí len svoje dáta.
4. **Settings → API** → skopíruj:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (tajný!) → `SUPABASE_SERVICE_ROLE_KEY`
5. Vytvor si prvý účet cez appku (`/signup`), alebo v Supabase **Authentication → Users → Add user**.
6. Voliteľné demo dáta: v SQL Editore spusti `select seed_demo_data('tvoj@email.sk');`.
7. Keď appku zverejníš pre viac ľudí, choď do **Authentication → Providers → Email** a rozhodni, či necháš verejné sign-upy zapnuté alebo len ty budeš pridávať účty ručne.

## 3. Claude (Anthropic) API kľúč

1. [console.anthropic.com](https://console.anthropic.com) → **API Keys** → vytvor kľúč.
2. Nastav platbu (Billing), inak volania zlyhajú.
3. Kľúč → `ANTHROPIC_API_KEY`. Tento kľúč beží **len na serveri** (Server Actions / Route Handlers) — nikdy sa neposiela do prehliadača.

## 4. Nasadenie na Vercel

```bash
git init
git add .
git commit -m "Mic Mouse — initial build"
git remote add origin <URL tvojho GitHub repa>
git push -u origin main
```

Potom na [vercel.com](https://vercel.com):
1. **Add New → Project** → importni GitHub repo.
2. **Environment Variables** → vlož všetky 4 hodnoty z `.env.example`.
3. **Deploy**.

Appka dostane URL v tvare `mic-mouse.vercel.app`. Vlastnú doménu (napr. `agents.instaview.sk`) vieš pripojiť v **Project → Settings → Domains**.

## Ako agenti fungujú

Každý agent je skutočný pracovný cyklus, nie karta v UI:

1. **Spustíš ho** (tlačidlom, cez Apolla, alebo autopilotom).
2. **Robí reálne kroky** — číta a zapisuje do tvojho CRM, vie si *naozaj* vyhľadať informácie na webe, píše texty. Každý krok vidíš v živej časovej osi na jeho karte.
3. **Nikdy nepredstiera.** Ak má poslať e-mail a kanál nie je napojený, zavolá `report_blocked`: prácu pripraví na schválenie a nahlási presne čo chýba a čo s tým máš spraviť.
4. **Myslí dva kroky dopredu.** Po každom kroku navrhne presne 2 ďalšie — jeden sledovací (čo odpovedali, aký to malo dopad, dá sa v tom pokračovať?) a jeden rozvíjací (ďalší cieľ, iná stratégia).
5. **Počíta výkon vs. náklad.** Pri každom návrhu je odhad tokenov, cena v eurách a verdikt *oplatí sa / hraničné / neoplatí sa* so zdôvodnením. Pravidlo je deterministické (`src/lib/agents/costs.ts`), nie nálada modelu: 3× bez odpovede alebo malá firma s nízkym dopadom = ďalší pokus sa neoplatí, agent navrhne iný kanál.

### Autopilot — „nechať bežať ďalej"

Zapneš prepínač a klikneš **Nechať bežať ďalej**. Agent potom reťazí krok za krokom sám: vyberie najlepší návrh, vykoná ho, vygeneruje nové návrhy, pokračuje. Zastaví sa sám, keď:

- minie tokenový rozpočet (nastaviteľný per agent),
- ďalší krok má verdikt *neoplatí sa*,
- narazí na nenapojený kanál,
- alebo nezostane nič zmysluplné.

Beží po jednom kroku cez `/api/autopilot`, takže reťaz môže byť ľubovoľne dlhá bez timeoutov a ty vidíš každý krok, ako dopadá.

### Apollo — nadriadený agent

Keď otvoríš appku, Apollo sa **sám ozve**: koľko agentov pracuje, koľko ich má problém a aký, čo im chýba, čo čaká na tvoje rozhodnutie a koľko to zatiaľ stálo. Čísla sú z databázy, nie vymyslené. Vie tiež naozaj spustiť ktoréhokoľvek agenta, založiť kontakt, obchod či úlohu.

### Čo agenti naozaj vedia (a čo nie)

| Kanál | Stav |
|---|---|
| Interné CRM | **napojené** — číta aj zapisuje |
| Web research | **napojené** — reálne vyhľadávanie cez Claude |
| E-mail (SMTP/Gmail) | nenapojené — agent napíše a pripraví na schválenie |
| LinkedIn, X | nenapojené — vyžadujú oficiálny API prístup |
| Reklamné platformy | nenapojené — agent kampaň naplánuje a napíše |
| Analytika (GA4) | nenapojené — bez nej nevie merať reálne dosahy |

Tento zoznam je v appke v Settings a agent sa ním riadi. Preto ti povie „pripravil som, ale odoslať to neviem — chýba mi toto" namiesto tichého predstierania.

## Čo reálne funguje (fáza 1)

- **Prihlásenie** — Supabase Auth, chránené routy.
- **Sales / CRM** — kontakty a obchody v skutočnej databáze.
- **Agenti** — živý stav (pracuje / čaká / zablokovaný / chyba), čo práve robia, história krokov, tokenový rozpočet a útrata v eurách.
- **Ďalšie kroky** — schránka návrhov s ekonomickým verdiktom.
- **Approvals** — schvaľovanie reálnych výstupov agentov s cenou každého behu.
- **Apollo** — hlásenie stavu + reálne akcie cez Claude tool-use.

Bez napojených kanálov appka nič nepredstiera — presne to je zámer.
