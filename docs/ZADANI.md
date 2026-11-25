# Boids Predator-Prey Simulace — Specifikace projektu

> Původní zadání projektu. Do 25. 11. 2026 bylo v `CLAUDE.md` (ř. 1–199); přesunuto sem doslova, protože se
> načítalo v každé session. Skutečný stav aplikace popisuje [`CLAUDE.md`](../CLAUDE.md), sekce „Stav implementace“,
> a kód (např. ovládání se od „doporučeného“ níže liší).

## Cíl
Vytvořit 2D simulaci ve stylu screensaveru pomocí **p5.js** (jedna HTML stránka, žádný build).
Na plátně se pohybují barevné entity tří frakcí (barev). Entity spolu spolupracují
(stejná barva) i se loví navzájem (cizí barva). Z jednoduchých pravidel má vznikat
emergentní chování: hejna, lov, útěk, rozpad hejna. Když přežije jediná barva,
scéna plynule přejde (fade) do nové scény s novým rozmístěním.

## Technologie
- **p5.js** (CDN), čistý JavaScript, jeden soubor `index.html` + `sketch.js`.
- Vektorová matematika přes `p5.Vector`.
- Cílový výkon: plynulé ~60 FPS při řádově 100–200 entitách. Použij prostorové
  dělení (spatial grid / hashing) pro hledání sousedů, ne O(n²) napřímo.
- Parametry simulace drž v jednom konfiguračním objektu `CONFIG` na začátku,
  ať se dají snadno ladit.

---

## Entita

Každá entita má:

### Identita
- `color` / `faction` — jedna ze 3 frakcí (barev).
- `role` — dynamická: `PREDATOR` nebo `PREY`. Není napevno! Role se mění podle
  kontextu (viz Hlad a Role).
- `character` — stálá povahová vlastnost: `PROTECTOR` (ochránce) nebo
  `ATTACKER` (útočník). Přiděluje se při spawnu, je neměnná.

### Fyzika
- `position` (vektor)
- `velocity` (vektor)
- `acceleration` (vektor)
- `maxSpeed` — základní max rychlost.
- `maxForce` — max síla otáčení (steering).
- Pohyb: standardní steering model (acceleration → velocity → position),
  rychlost ořezaná na `maxSpeed`.

### Vnitřní stav
- `hunger` — 0..1. Roste v čase. Čím vyšší hlad, tím:
  - vyšší aktuální rychlost (hladový loví agresivněji a rychleji),
  - vyšší ochota riskovat lov.
- `fear` — 0..1, aktuální míra strachu (dynamická, roste přítomností predátora
  v dohledu, klesá v čase / v bezpečí hejna).
- `courage` — 0..1, povahová konstanta (odvaha). Ovlivňuje práh, kdy entita
  uteče vs. zůstane / brání.
- `energy` / `alive` — entita umírá, když je sežrána. (Volitelně: hlad může
  vést k oslabení, ale primárně řešíme smrt sežráním.)

### Po nasycení
- Když entita někoho uloví (sní), `hunger` spadne na nízkou hodnotu a entita
  je na krátkou dobu **"nasycená"**: dočasně neloví, zpomalí, vizuálně se
  odliší (např. krátký jasnější/tmavší odstín). Po uplynutí doby se vrací
  k normálu.

---

## Vnímání (Perception)

Žádná entita nevidí 360°. Vnímání má dvě složky:

### 1. Zorný kužel (vision cone)
- Entita vidí jen **výřez (kužel)** ve směru pohybu (`velocity`).
- Parametry: `visionRange` (dosah) a `visionAngle` (úhel kužele, např. 120°).
- Neřešíme otáčení hlavou — kužel míří vždy ve směru pohybu.
- Cokoli mimo kužel entita "nevidí", i kdyby to bylo blízko.

### 2. Proxy spot (sluch / blízká detekce)
- Inspirováno mechanikou *World of Tanks*: i mimo zorný kužel entita
  zaregistruje cokoli, co se dostane do malého **proxy poloměru**
  (`proxyRange`, výrazně menší než `visionRange`).
- Interpretace: "slyší, jak někdo dupe poblíž".
- Důsledek (jako v *Commandos*): predátor se může nepozorovaně přiblížit
  zezadu/mimo kužel až na hranici proxy poloměru. Teprve uvnitř proxy ho
  kořist zaregistruje.

> Když cokoli vstoupí do perception (kužel NEBO proxy), entita "se podívá kdo to je"
> a podle frakce + role + charakteru se rozhodne, jak reagovat (viz Rozhodování).

---

## Rozhodování — reakce na to, co vidí

Když entita zaznamená jinou entitu, vyhodnotí:

### A) Je to spojenec (stejná frakce)?
- **Rozhodnutí přidat se / projít kolem:** entita zváží, jestli se k němu
  přidá (kohéze → tvorba hejna) nebo jen pokračuje svou cestou.
  - `PROTECTOR` má vyšší sklon se připojovat a držet hejno pohromadě.
  - Pokud je spojenec **pomalejší nebo pronásledovaný** (utíká, má vysoký fear):
    - `PROTECTOR` zváží, zda mu **půjde na pomoc** — ale jen pokud to není
      sebevražedný risk (porovná míru hrozby vs. vlastní `courage` a `fear`).
      Když je risk příliš velký, pomoc odmítne a zachová se sobecky.
    - `ATTACKER` pomáhá méně, spíš se stará o vlastní lov.

### B) Je to cizí frakce (potenciální kořist nebo hrozba)?
Záleží na vzájemném vztahu rolí a na velikosti uskupení:

- **Lov:** hladová entita (vysoký `hunger`) vnímá menší/osamocenou cizí entitu
  jako kořist a vydá se po ní. `ATTACKER` riskuje víc a loví ochotněji;
  `PROTECTOR` loví opatrněji.
- **Síla hejna (deterrence):** predátor by **neměl** zaútočit na entitu, která
  je obklopena velkým hejnem spojenců — hrozí, že "dostane nařez" od hejna.
  Tj. čím větší a sevřenější hejno kolem cílové kořisti, tím nižší ochota
  predátora zaútočit.
- **Vtržení do hejna:** když predátor přesto vletí do hejna, okolní kořisti
  dostanou strach (`fear` nahoru) a začnou se rozprchávat. Tím se hejno
  **oslabí / rozpadne**, deterrence klesne a predátor si může **vyčíhnout
  jednu izolovanou oběť** a soustředit se na ni.

### C) Strach vs. odvaha (kořist pod hrozbou)
- Když je v dohledu predátor, roste `fear`.
- Rozhodnutí utéct vs. zůstat = funkce `fear` vs. `courage` (a charakteru).
  - Vysoký fear / nízká courage → útěk.
  - Vysoká courage (a/nebo blízké velké hejno) → zůstat, případně bránit.

---

## Chování při útěku (kořist)

Když se kořist rozhodne utéct, zvolí jednu ze strategií (s pravděpodobností /
podle situace):

1. **Útěk ke spojencům:** pokud nějaké spojence vidí, běží k nim hledat ochranu
   hejna.
2. **Slepý útěk / klička:** pokud spojence nevidí, prchá pryč od predátora a
   **mění směr jako zajíc** (občasné náhodné zalomení trasy), aby se hůř lovila.
3. **Smůla:** při slepém útěku se může omylem dostat **mezi nepřátele** —
   to je přirozené riziko, neošetřovat to "chytře", ať vznikají dramatické situace.

---

## Steering behaviors (stavební kameny)

Klasické boids rozšířené o role. Každá entita počítá výsledné zrychlení jako
**vážený součet** těchto sil (váhy v `CONFIG`, ať se dají ladit):

- **Separation** — nenarážet do nejbližších sousedů.
- **Alignment** — srovnání směru se spojenci v dohledu.
- **Cohesion** — držet se ke středu blízkých spojenců (tvorba hejna).
- **Flee** — utíkat od blízkého predátora (kořist).
- **Pursue / Seek** — mířit na kořist (predátor); ideálně predikce budoucí
  pozice cíle, ne jen aktuální.
- **Protect** — `PROTECTOR` se vmezeří mezi ohroženého spojence a hrozbu.
- **Wander** — když nikoho nevidí, entita se "poflakuje": plynulý náhodný
  pohyb (wander steering), díky němuž se časem potkávají shluky.
- **Avoid edges** — odrážení/zatáčení u okrajů plátna (žádné tvrdé teleporty;
  raději plynulé zatočení nebo měkký wrap — vyber, co vypadá líp).

> Váhy jednotlivých sil se **modulují** podle role, charakteru, hunger a fear.
> Např. predátor má vysokou váhu Pursue a nízkou Cohesion; vyděšená kořist
> má vysokou Flee a sníženou Wander; protector má zvýšenou Protect/Cohesion.

---

## Životní cyklus scény

1. **Spawn (start scény):** tři frakce se objeví **odděleně** ve vlastních
   zónách/rozích plátna (žádné okamžité míchání). Každá entita dostane náhodně
   `character` (protector/attacker) a počáteční `courage`.
2. **Průběh:** frakce se díky wanderu postupně setkávají → vznikají interakce,
   lov, hejna, útěky, rozpady hejn.
3. **Konec:** když na scéně zbude **jediná frakce (barva)**, scéna se ukončí.
4. **Přechod:** **plynulý fade** (do ztracena) a po fadu **respawn** nové scény
   od bodu 1 (nové rozmístění, noví jedinci).

---

## Vizuál
- Čistý, klidný "screensaver" dojem. Tmavé pozadí, jasné barvy frakcí.
- Entita = jednoduchý tvar orientovaný po směru pohybu (např. trojúhelník/šipka),
  ať je vidět, kam "kouká".
- **Volitelně (debug režim, přepínač klávesou):** vykreslit zorný kužel,
  proxy poloměr a vektory sil — kvůli ladění a kvůli tomu, že je hezké to vidět.
- Nasycený stav, vysoký fear apod. lze naznačit jemnou změnou jasu/velikosti.

## Ovládání (doporučené)
- `Mezerník` — pauza / běh.
- `D` — debug overlay (kužely, proxy, vektory).
- `R` — okamžitý restart scény.
- (Volitelně) posuvníky nebo klávesy pro úpravu hlavních vah `CONFIG` za běhu.

---

## Pořadí implementace (doporučené)
1. Kostra p5.js + `CONFIG` + třída `Entity` + základní pohyb (wander, okraje).
2. Spatial grid pro sousedy.
3. Základní boids (separation/alignment/cohesion) v rámci frakce.
4. Vnímání: zorný kužel + proxy spot.
5. Role (predator/prey) + hunger + lov + nasycení + smrt.
6. Fear/courage + útěk (tři strategie) + character (protector/attacker) + protect.
7. Deterrence hejnem + vtržení do hejna a jeho rozpad.
8. Životní cyklus scény: detekce vítěze + fade + respawn.
9. Debug overlay a doladění vah.

> Drž kód čitelný a parametrizovaný. Cílem je hračka na pozorování emergentního
> chování — preferuj přehlednost a laditelnost před předčasnou optimalizací
> (kromě spatial gridu, ten je potřeba hned).
