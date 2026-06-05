# Predator-Prey Boids — TODO / Roadmap

Pracovní seznam, ať se v rozdělané práci neztratíme. Ladíme **pozorováním** a
po vrstvách. Hotové odškrtáváme, nové nápady padají do backlogu.

---

## ✅ Hotovo — Souboje v1 (ukusování)
- [x] Souboj = **oboustranné ukusování** energie (= život); režie (`biteEfficiency`)
      → energie ze systému ubývá → duel vždy dospěje k vítězi (`doBite`).
- [x] Vítěz vyčerpaný (boj žere energii i staminu) → může pak umřít hlady.
- [x] Tempo kousání = `strength × stamina` (zadýchaný kouše slaběji).
- [x] **Osobní prostor** per-entita (`boids.personalSpace`).
- [x] **`maxAttackersPerTarget`** — cap útočníků na jeden cíl (1 = férový 1v1).
- [x] **Tlačenice** zpomaluje (protahování davem; `CONFIG.crowd`).
- [x] Rozhodnutí **klid / útěk / postavit se a bojovat** + past (`trapped`)
      + vytržení z boje (`breakOffFear`) + individuální `fightBias`.
- [x] Kolizní podlaha **podle dvojice** (sevření spojenců u fronty, překryv
      útočník↔cíl, protažení kolem cizího) — `CONFIG.collision`.
- [x] **Viditelná síla + zranění** do `willingToAttack` i strachu.
- [x] Nasycení dle **plného břicha** (ne časovač); léčení až **po** boji.
- [x] Vizuál: červený obrys boje; debug `FIGHT` / `síla` / `útoč:`; legenda.

---

## ✅ Vrstva A — Squady: sdílená informační vrstva  (HOTOVO)
Cíl: skupina sdílí, co vidí a jak je silná → commitnou se nevyrovnané boje
(3 vs 8), přestane bezdůvodné hladovění, zadák ví o nepříteli.

- [x] `buildSquads()` — shlukování stejné frakce **union-find přes blízkost**
      (řetězí se → „žížaly"; rozpad na podskupiny vzniká přirozeně).
- [x] Agregáty squadu: `size`, `power` (Σ `strength × zdraví`), těžiště.
- [x] **Sdílený odhad nepřítele**: `enemyPower` + těžiště z **viditelných**
      nepřátel (mlha války; frontman vidí nejvíc; skrytý bok překvapí).
- [x] `willingToAttack` přes **squad power vs viditelný enemyPower**.
- [x] Strach/odvaha škálované **poměrem síly squadů** (commit u převahy,
      opatrnost u remízy = ty „rybičky").
- [x] **Drtivá převaha → povinný commit** (`squad.overwhelm` vypne opatrnost).
- [x] Odvaha z **celé velikosti squadu** (zadák je odvážný, ač sám nic nevidí).
- [x] **DEBUG**: území squadu (disky + hull) + průhledné podbarvení frakcí; štítky
      kreslené nakonec s obrysem (čitelnost).
- [~] Průběžně laděno pozorováním (`squad.radius/sightRange/overwhelm`, proxy/dohled).

> Pozn.: viditelná „reakce zadáka" (otočit se ke hrozbě) je až ve Vrstvě B (rally).

### ⚠️ Zjištění z pozorování (→ řeší Vrstva B)
Squady se tvoří pěkně, ale **hromadný útok většiny na menšinu nefunguje**: větší
skupina menší jen **pronásleduje v zástupu** (stern chase, stejná rychlost →
nedožene) a menší pak **vyhladoví v běhu**. Kořen problému:
- `pickPrey` bere cíl jen z **individuálně vnímaných** nepřátel → zadáci, kteří
  nepřítele nevidí, **nemají koho lovit** a jen plynou za hejnem. „Hromada" je
  tak reálně jen pár předáků.
- Honička je **tail-chase**, ne **obklíčení** → bez intercept/encirclement se
  rovnocenně rychlá kořist nedá chytit.
→ **Vrstva B**: (a) rally nevidoucích členů na `squad.enemyCx`, (b) obkličování
  (flanking / prediktivní intercept), aby přesila kořist sevřela.

### ✅ Drobné úpravy (hotovo při ladění A)
- [x] Snížen `energy.metabolism` (0.00010 → 0.00005) — míň smrtí hladem.
- [x] Ovládání rychlosti: `−`/`+` zpomalit/zrychlit, `0` normál (slow-motion
      pro pozorování); rychlost v HUD.
- [x] **Setrvačnost rozhodnutí** (`CONFIG.decision`): postoj se drží `holdFrames`
      a přehodnotí se až po vypršení / při tvrdém přerušení (cíl zmizel, hrozba
      zmizela, panika, past). Konec blikání stavů každý snímek.
- [x] **Hlad dělá odvahu (desperation), ne sraby.** Dřív `menace ∝ hlad cizího`
      → ke konci scény (všichni hladoví) se všichni báli všech → patová strnulost
      a hromadné vyhladovění. Oprava: (a) hladová složka strachu utlumena
      (`fear.baseThreat` + malé `fear.hungerThreat`; hrozba teď hlavně z aktivního
      lovu / „jde po mně"); (b) `fear.hungerBravery` přidává hlad do odvahy →
      konec scény = hladové běsnění, ne strnulost. Ladí se těmito třemi konstantami.

---

## 🟡 Vrstva B — Rally / pomoc do boje
Cíl: když jde spojenec do boje, ostatní reagují (přiběhnou / kryjí).

- [x] `helpDesire` skóre z faktorů: **role (charMods.rally), odvaha − strach,
      převaha squadu (advW), únava/zranění (tiredHold)** → `CONFIG.rally`.
- [x] Rally steering: člen bez vlastního cíle vyrazí k `squad.enemyCx`
      (kolektivně viděné těžiště nepřítele) → zapojí se i zadáci.
- [x] **Taktika linií**: unavený/zraněný se drží v 2. linii, dokud squad vede;
      při zvratu (adv < desperation) se penalizace uvolní a zapojí se.
- [x] **Fix capu**: `incomingAttackers` počítá jen útočníky blízko cíle
      (`combat.slotRange`) → stragglery neblokují sloty; `maxAttackersPerTarget` 3→5.
- [x] DEBUG: stav `RALLY` v sondě + světle modrá čára k těžišti nepřítele.
- [ ] Doladit váhy (`rally.*`, `slotRange`) — pozorováním.
- [ ] **Obkličování** je zatím EMERGENTNÍ (rally přivádí spojence z více směrů).
      Pokud nestačí na chytání rovnocenně rychlé kořisti → přidat explicitní
      intercept/flanking (rozdělit útočníky na boky, prediktivní odříznutí).

---

### ✅ Hospodaření s energií (oprava „nikdo není sytý / healing jen na začátku")
Diagnóza: energie je uzavřený ztrátový systém (jediný zdroj = sežrat někoho,
každý přenos ničil 40 %), navíc **jedení nesnižovalo hlad** → všichni časem
maximálně hladoví a chudí, sytost (≥1.05) ani healing (komfort 0.7) nedosažitelné.
- [x] **A — jedení tiší hlad** (`hunt.feedFactor`): `hunger -= vstřebané × feedFactor`.
      Vrací stav „po jídle sytý a klidný" a polaritu sytý=opatrný / hladový=běsní.
- [x] **B — vyšší výnos z jídla**: `combat.biteEfficiency` 0.6 → 0.85 (sežrání víc nakrmí).
- [x] **C — dosažitelná sytost/healing**: `hunt.satiationFull` 1.05 → 1.0;
      `heal.comfortThreshold` 0.7 → 0.55.
- [ ] **D (rezerva na ladění)** — utlumit bojový/sprint exertion
      (`combat.exertionEnergy/Stamina`, `energy.sprintDrain`), kdyby souboje
      krvácely energii moc. Metabolismus je neškodný (~5,5 min), neřešit.

## 🗄️ Backlog — nápady na později
- [ ] **Klany**: trvalá identita + sdílené vlastnosti (přebijí chování squadu).
- [ ] **Skrytý skill** (mířit na slabiny / lepší úhyb) — při rozhodování
      neviditelný, překvapí až v boji.
- [ ] **Hluk z bojiště**: boj dělá křik/rámus → šíří se na dálku → vzdálení to
      „zaslechnou" a reagují (auditory aggro nezávislé na zorném kuželu).
- [ ] **Mršina + ujídání** (zbylá energie po plném vítězi se nevyplýtvá).
- [ ] Průběžný **tuning souboje** (`biteBase`, `biteEfficiency`, `exertion*`).

---

## 🎛️ Kde se co ladí (rychlý odkaz do CONFIG)
- Souboj: `CONFIG.combat` (biteBase, biteEfficiency, exertion*, maxAttackersPerTarget).
- Sevření/překryv: `CONFIG.collision` (allyTightFactor, combatOverlapFactor, enemySqueezeFactor).
- Rozhodnutí boj/útěk: `CONFIG.fear` (fightCourage, trappedFrames, breakOffFear, fightBias…).
- Tlačenice: `CONFIG.crowd`. Síla: `CONFIG.strengthStart`. Sytost: `CONFIG.hunt.satiationFull`.
- Squady (Vrstva A): `CONFIG.squad` (radius, sightRange, overwhelm).
