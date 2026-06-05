# Predator–Prey Boids

2D „screensaver" simulace emergentního chování ve stylu boids, napsaná v čistém
**p5.js** (jedna HTML stránka, žádný build). Na ploše se střetávají barevné
frakce entit, které spolu spolupracují (stejná barva) i se loví (cizí barva).
Z jednoduchých pravidel vzniká hejnové chování, lov, útěk, rozpad hejn — a každá
scéna má své *intro* (představení světa a frakcí), *akci* a *vyhodnocení* vítěze.

## Spuštění

Stačí otevřít `index.html` v prohlížeči (p5.js se načítá z CDN).
Nebo lokálním serverem, ať funguje bez omezení `file://`:

```bash
python -m http.server 8123
# pak otevři http://localhost:8123/index.html
```

## Ovládání

- **H** — legenda (co znamenají barvy/velikosti/stavy + pravidla chování)
- **Mezerník** — pauza / běh
- **D** — detailní (debug) overlay: zorné kužely, proxy, vektory sil, sonda,
  obálky a síla squadů
- **R** — restart / nová scéna
- **−** / **+** — zpomalit / zrychlit simulaci (slow-motion pro pozorování)
- **0** — normální rychlost

## Co se ve scéně děje

- Entita má **frakci** (barva + tvar), dynamickou **roli** (predátor/kořist),
  stálou **povahu** (ochránce/útočník), stálou **sílu** a osobní **odvahu**,
  a vnitřní stav: **hlad, strach, energii a staminu**.
- **Vnímání**: zorný kužel ve směru pohybu + malý „proxy" poloměr (sluch).
- **Souboj = ukusování (ne dotyk = smrt)**: lovec i bránící se kořist si
  navzájem **ukusují energii** (= život), dokud jeden nepadne. Silnější a méně
  zadýchaný vyhrává; vítěz z boje vyjde vyčerpaný. Sežrání **nasytí** (utiší hlad
  a doplní energii).
- **Squady (sdílená informace)**: spojenci nablízku tvoří skupinu, která sdílí,
  **jak je silná** a **co kolektivně vidí** — i zadák, který sám nepřítele
  nevidí, „ví", kde je. Nevyrovnané střety se proto **commitnou** (přesila jde
  do útoku), vyrovnané zůstávají obezřetné.
- **Rally a obkličování**: jde-li spojenec do boje, ostatní (podle role, odvahy,
  únavy a převahy) **přiběhnou na pomoc** z více směrů → kořist se sevře.
- **Strach vs. odvaha**: kořist prchá (tři strategie — k hejnu, klička, smůla),
  nebo se **postaví a bojuje** (má-li odvahu, nebo je-li zahnaná do kouta).
  **Hlad dělá odvahu** — vyhladovělí riskují až běsní (konec scény = hladové
  střety, ne strnulost). Ochránci se vmezeřují mezi spojence a hrozbu.
- **Síla v počtech**: přesila (počtem i silou) láká k útoku, silný/sevřený
  protivník útočníka odradí.
- **Energie a stamina**: pohyb řídí zásoba sil (kdo dlouho neuloví, slábne a může
  umřít hlady) a krátkodobý sprint (přepálení → zadýchání). Zranění se po boji
  léčí v hejnu, kde jim zdraví spojenci darují přebytek energie.
- **Smršťující se aréna**: ubývá-li entit, hrací plocha se zužuje (a vpravo roste
  panel s legendou a komentářem), aby se poslední přeživší potkali.
- **Konec scény**: když přežije jediná frakce, vyhlásí se vítěz a začne nová
  scéna s novým světem, frakcemi (2–6) a rozmístěním.

Veškeré parametry jsou v objektu `CONFIG` na začátku `sketch.js`, ať se dají
snadno ladit.

## Jak to funguje — model chování

Celé chování vzniká **emergentně** z lokálních pravidel: každá entita každý
snímek vnímá okolí, vyhodnotí stav a poskládá z dílčích sil (steering) výsledný
pohyb. Níže je popis věrný kódu (`Entity.update()` v `sketch.js`).

### Svět a scéna
- **Svět** má náhodný název (tematické sady — Klingon, Duna, severská mytologie…)
  a **archetyp planety** (terran, poušť, oceán, led, džungle, vulkán, ametyst,
  tyrkys, savana), který určuje barvy povrchu i poměr souš/voda. Povrch planety
  z intra slouží i jako tlumené **pozadí hrací plochy**.
- Ve scéně se utká **2–6 frakcí**. Každá má barvu, **tvar** a startovní populaci,
  rozesetou do několika **startovních zón** (s minimálním vzájemným odstupem).
- **Hrací plocha se smršťuje** podle počtu žijících (asymetricky — vlevo se
  zužuje, vpravo roste panel s komentářem), aby se poslední přeživší potkali.

### Entita — vlastnosti
**Identita (stálá):**
- **Frakce** — barva + tvar; spojenci = stejná frakce, cizí = jiná frakce.
- **Povaha (`character`)** — `PROTECTOR` (ochránce) nebo `ATTACKER` (útočník).
  Neměnná, přidělená při zrození. Mění *váhy* chování (viz níže).
- **Odvaha (`courage`, 0..1)** — neměnná osobní konstanta proti strachu.
- **Síla (`strength`)** — neměnná, **viditelná** (soupeř ji při rozhodování
  o útoku zváží). Určuje tempo ukusování a váhu v poměru sil. (Později ji přebije
  klan; skrytý „skill" — mířit na slabiny / lepší úhyb — přijde v další fázi.)
- **Osobní prostor (`spacing`)** — jak blízko snese ostatní v hejnu (mírný
  rozptyl, ať hejno nevypadá mřížkovaně).

**Role (dynamická, přepočítává se každý snímek):**
- `PREDATOR` (lovec) vs. `PREY` (kořist) — **není napevno!** Entita se stává
  lovcem, jen když má hlad nad prahem, neutíká, není nasycená a vidí kořist,
  na kterou si troufne. Jinak je kořist.

**Vnitřní stavy (dynamické):**
- **Hlad (`hunger`, 0..1)** — roste v čase; nad prahem pohání lov a navíc **dodává
  odvahu** (desperation). **Klesá jedením** (ukusováním kořisti).
- **Energie (`energy`, 0..~1.3)** — dlouhodobá „síla" a zároveň **život**. Klesá
  metabolismem, sprintem a soubojem; ukusováním klesá oběti a **doplňuje se
  útočníkovi**. **Při 0 = smrt** (hlady nebo sežráním). Řídí cruise rychlost.
  Nad prahem sytosti (plné břicho) entita přestane shánět nové cíle a zpomalí.
- **Stamina** — krátkodobý sprint. Vybíjí se sprintem i soubojem, regeneruje
  v klidu. Vyčerpání → **zadýchání** (zpomalení a slabší kousnutí).
- **Strach (`fear`, 0..1)** — roste přítomností hrozby (hlavně té, co aktivně
  loví / jde po mně), klesá v bezpečí. Proti odvaze rozhoduje útěk / boj / klid.

### Vnímání
Entita **nevidí 360°**. Vnímá ve dvou složkách:
- **Zorný kužel** ve směru pohybu (dosah + úhel) — co je mimo, „nevidí".
- **Proxy spot** — malý poloměr kolem dokola („sluch"). Predátor se tak může
  nepozorovaně přiblížit zezadu až na hranici proxy.

Vše ostatní (rozhodování, hejno, lov, strach) pracuje **jen s tím, co entita
v daný snímek vnímá**.

### Vztahy mezi vlastnostmi (jak se ovlivňují)
- **Hlad → role:** vysoký hlad dělá z entity lovce (ATTACKER loví při nižším
  prahu, PROTECTOR při vyšším).
- **Energie → rychlost:** nízká energie = pomalý „cruise" (šetření), umírání;
  vysoká = svižný pohyb. Hlad **nedává** rychlost zadarmo — to dělá až sprint.
- **Stamina → sprint:** umožní krátký výtrysk rychlosti (lov i útěk); přepálení
  vede k zadýchání a zpomalení → sázka, kdy ji utratit.
- **Strach vs. odvaha (+ hejno + hlad):** rozhoduje útěk / boj / klid. Odvahu
  dodává **velikost squadu** (i zadák ví, že je nás hodně) a hlavně **hlad**
  (vyhladovělý riskuje až běsní) — proti tomu stojí strach.
- **Síla squadů:** porovnání **síly celé skupiny vs. síly viditelného nepřítele**
  (síla = počet × `strength` × zdraví) řídí **současně** strach (přečíslení =
  děsivější) i ochotu zaútočit; **drtivá převaha → povinný útok**. Síla i
  zranění (nízká energie) cíle jsou **viditelné**, skrytý skill ne.

### Rozhodovací logika (každý snímek, v pořadí priorit)
1. **Squady** (před cyklem) → spojenci nablízku se shluknou; spočítá se síla
   skupiny a kolektivní odhad nepřítele (sdílí ho i ti, kdo sami nevidí).
2. **Vnímání** → rozdělí okolí na spojence a cizí.
3. **Hrozba a strach** → z cizích spočítá míru ohrožení (hlavně z toho, že cizí
   aktivně loví / **jde přímo po mně**, jen mírně z jeho hladu; škáluje to poměr
   síly squadů), z toho roste strach a směr „pryč od hrozeb".
4. **Postoj: klid / útěk / boj** → strach proti odvaze (odvaha = povaha + squad +
   **hlad**). Vysoký strach → **útěk**; dost odvahy nebo **zahnání do kouta** →
   **postavit se a bojovat**. Rozhodnutí má **setrvačnost** (drží se chvíli,
   nepřehodnocuje se každý snímek), dokud ho nepřeruší cíl/hrozba zmizí, panika,
   nebo past.
5. **Lov?** Pokud neutíká, má hlad a vidí kořist, na kterou si **troufne** (síla
   squadu vs. nepřítel) → **lov**. Cíl si **drží se závazkem** i krátce mimo
   dohled. Na jeden cíl smí **omezený počet** útočníků (férovost soubojů).
6. **Souboj (ukusování)** → je-li nepřítel na dosah, ukousne mu kus energie
   (a on jemu); jídlo utiší hlad a doplní energii.
7. **Rally** → kdo nemá vlastní cíl, ale jeho squad bojuje, vyrazí (podle ochoty)
   k těžišti nepřítele na pomoc.
8. **Léčení** zraněného (mimo boj; viz níže).
9. **Energie/stamina/rychlost** → max rychlost, sprint, zpomalení v tlačenici.
10. **Síly pohybu** (váženo podle role/povahy/stavu): rozestup + srovnání směru +
    soudržnost hejna, a navrch buď útěk, lov, boj, rally, ochrana, nebo
    poflakování; nakonec odpor od kraje arény.
11. **Setrvačnost pohybu** → směr se smí otočit jen o omezený úhel (klesá
    s rychlostí): rychlý dělá široké oblouky, pomalý kličkuje ostře.

### Hejno: kdy a proč se připojí / odpojí
- **Připojení:** jakmile entita vnímá spojence, **soudržnost** (cohesion) ji
  táhne ke středu hejna, **srovnání** (alignment) sladí směr a **rozestup**
  (separation) drží osobní prostor; tělesné kolize navíc brání prolnutí. Zároveň
  se **utlumí poflakování** (wander) — hejno tak drží pohromadě. `PROTECTOR` se
  drží hejna víc, `ATTACKER` méně.
- **Odpojení:**
  - **Lov:** lovec má utlumenou soudržnost (jde za kořistí) → **opouští hejno**.
  - **Útěk:** strach přebije hejnové síly (viz panika níže).
  - **Zranění:** naopak posílí touhu být v hejnu (hledá pomoc/healing).

### Lov, souboj a skupinové napadání (síla v počtech)
- Lovec míří na **nejbližší kořist, na kterou si troufne** (predikuje její pohyb)
  a na blízko **vystartuje sprintem**. V dosahu se rozpoutá **souboj**.
- **Souboj = oboustranné ukusování.** Útočník i bránící se kořist si navzájem
  ukusují **energii**; tempo = `strength × stamina` (zadýchaný kouše slaběji).
  Z ukousnutého se vstřebá většina, zbytek je „režie" → energie ze světa pomalu
  ubývá, takže duel vždy dospěje k vítězi. **Vítěz je vyčerpaný** a může pak sám
  padnout hlady. Sežrání **utiší hlad a doplní energii**.
- **Útočník a jeho cíl se smí překrývat** (válejí se po sobě), spojenci se smí
  u fronty namačkat na těsno a kolem cizího protáhnout — aby se do kotle zapojilo
  co nejvíc členů. Na jeden cíl ale smí najednou útočit jen **omezený počet**
  (řídí konstanta — 1 = férový 1v1, víc = smečka).
- **Deterrence:** na **silnějšího nebo přečísleného** protivníka (síla celého
  squadu vs. viditelný nepřítel) lovec nezaútočí. Hlad a povaha ATTACKER tu
  opatrnost srážejí; **drtivá převaha** ji vypne úplně (povinný útok).
- **Skupinové napadání + obkličování:** jde-li spojenec do boje, ostatní z squadu
  (i ti, co nepřítele sami nevidí) **vyrazí na pomoc** k těžišti nepřítele
  z různých směrů → osamělec/menšina se **sevře**. Unavení a zranění se přitom
  drží ve **2. linii**, dokud squad vede; při zvratu se zapojí i oni.

### Strach, útěk a rozpad hejna (panika)
Pod tlakem se entita buď **postaví a bojuje** (má-li dost odvahy — kterou zvyšuje
hejno a hlavně **hlad** — nebo je-li **zahnaná do kouta** a útěk nikam nevede),
nebo **utíká**. Vyhladovělý se proto spíš pere než prchá. Když se rozhodne utéct,
podle situace volí strategii:
1. **Ke spojencům** — vidí-li hejno, prchá od hrozby a zároveň míří do středu
   hejna pro ochranu.
2. **Slepý útěk + klička** — bez spojenců prchá pryč a **kličkuje jako zajíc**
   (občasné zalomení do strany), aby se hůř lovila.
3. **Smůla** — při slepém útěku může vběhnout **mezi nepřátele**; neošetřujeme
   to „chytře", ať vznikají dramatické situace.

**Rozpad hejna:** když predátor vtrhne do hejna a vybere si oběť, ta dostane
silný strach („jde po mně") a okolní kořisti taky (blízký lovící predátor).
Vystrašení se rozprchnou → hejno prořídne → ubyde spojenců → **klesne odvaha
i ochrana** → další se začnou bát a prchat → **kaskáda**, která hejno roztrhá na
jednotlivce nebo menší skupinky. Tím deterrence klesne a predátor si vyčíhne
izolovanou oběť.

### Healing (skupinová pomoc)
- **Zraněná entita** (nízká energie) silněji **lne k hejnu** (zvýšená soudržnost)
  a „zaparkuje" v něm.
- **Zdraví spojenci jí postupně darují energii** — ale jen ze svého **přebytku
  nad komfortní mezí**: kdo je sám pod komfortem, nedává nic (sebezáchova); kdo
  se „přejedl", dá víc. Náklad se **rozkládá na celé hejno** (víc dárců = rychlejší
  uzdravení, každý obětuje jen drobek) a dárci **nikdy neklesnou pod komfort**.
- Příjemce se takto dohojí jen **do komfortu** (výš už si musí ulovit). Healing
  může entitu vytáhnout i z hrany smrti hladem — pokud je v dobrém hejnu.

### Energie, stamina, rychlost (proč se plíží / vystřelí / umírá)
- **Cruise** rychlost roste s energií → vyhladovělý se plíží (a vizuálně zmenší),
  najedený je svižný a větší.
- **Sprint** (na úkor staminy + energie) je krátký výtrysk při lovu/útěku;
  přepálení → **zadýchání** a zpomalení → kořist může uniknout, lovec mine.
- Kdo dlouho neuloví, **slábne a může umřít hlady** (smrt i bez sežrání).

### Konec scény a příčina prohry
- Scéna končí, když přežije **jediná frakce**. Plynulý fade vyhlásí vítěze a
  **proč ostatní padly** — sleduje se totiž, kolik členů frakce padlo **lovem**
  vs. **hlady**: *byla vyhlazena* / *vyhladověla* / *byla zlomena a dolovena*.
- Pak začne nová scéna (nový svět, planeta, frakce a rozmístění).

## Technologie

p5.js (CDN), čistý JavaScript. Hledání sousedů přes prostorovou mřížku
(spatial grid), aby simulace zvládla ~100–200 entit plynule.

## Konfigurace (`CONFIG`)

Všechny laditelné parametry jsou v objektu `CONFIG` na začátku `sketch.js`
(autoritativní popis je v komentářích u jednotlivých polí). Níže je přehled
významu, typického rozsahu a **jednotek**.

### Konvence jednotek
- **Rychlost**: px / snímek (při cílových ~60 FPS, tj. px·60/s).
- **Síla / váha**: bezrozměrný násobič steeringové síly (vyšší = silnější vliv).
- **Vzdálenost / dosah / poloměr**: px (není-li uvedeno „podíl plátna").
- **Čas**: snímky (frames); sekundy ≈ snímky / 60.
- **Úhel**: stupně (`visionAngle`) nebo radiány (`turn.*`).
- **Stav 0..1**: hlad, strach, odvaha, energie, stamina; jejich „rate" =
  změna stavu **za snímek**.
- **Barva**: RGB 0–255. **Podíl/poměr**: 0..1.

### Scéna a vizuál
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `count` | celkový počet entit (rozdělí se mezi frakce) | 40–200 | ks |
| `factionsRange` | min–max počet frakcí (náhodně) | [2, 6] | ks |
| `palette` | barvy frakcí (vybere se podmnožina) | — | RGB |
| `background` | základní barva pozadí | — | RGB |
| `entitySize` | velikost entity | 6–14 | px |
| `worldBg.tint` | tint textury pozadí (nižší = tmavší) | 80–200 | RGB-násobič |
| `worldBg.muteAlpha` | krytí tlumicí vrstvy (vyšší = tmavší/plošší) | 60–160 | 0–255 |

### Pohyb a setrvačnost
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `maxSpeed` | základní max rychlost | 2–4 | px/snímek |
| `maxForce` | max steeringová síla | 0.08–0.2 | px/snímek² |
| `minSpeedFactor` | minimální rychlost (násobek maxSpeed) | 0.1–0.4 | podíl |
| `turn.baseRate` | otáčení při referenční rychlosti | 0.1–0.2 | rad/snímek |
| `turn.speedRef` | rychlost, kde platí baseRate | ~2 | px/snímek |
| `turn.maxRate` / `minRate` | strop/spodní mez otáčení | 0.3 / 0.045 | rad/snímek |
| `wander.circleDist` / `circleRadius` | geometrie wanderu | 28 / 16 | px |
| `wander.noiseSpeed` | rychlost změny směru poflakování | 0.004–0.01 | /snímek |
| `wanderLoneWeight` / `wanderFlockWeight` | váha wanderu sám / v hejnu | 1.0 / 0.25 | váha |
| `edge.margin` / `edge.weight` | odkud zatáčet od kraje / síla | 90 / 1.6 | px / váha |

### Vnímání, grid, boids, kolize
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `perception.visionRange` | dosah zorného kužele | 90–130 | px |
| `perception.visionAngle` | šíře kužele | 100–160 | ° |
| `perception.proxyRange` | „sluch" kolem dokola | 35–60 | px |
| `grid.cellSize` | buňka mřížky (≥ největší dotaz) | ~60 | px |
| `boids.separationRange` / `…Weight` | odstup / síla rozestupu | 32 / 2.6 | px / váha |
| `boids.alignmentWeight` / `cohesionWeight` | srovnání směru / držení hejna | 1.0 / 0.9 | váha |
| `boids.personalSpace` | per-entita násobek odstupu (osobní prostor) | [0.8, 1.2] | násobič |
| `collision.bodyRadius` | poloměr těla (2× = min. odstup) | 5–8 | px |
| `collision.iterations` / `push` | průchody / díl rozhrnutí | 2 / 0.5 | ks / podíl |
| `collision.allyTightFactor` | sevření spojenců u fronty (násobek podlahy) | 0.45 | podíl |
| `collision.combatOverlapFactor` | překryv útočník↔cíl (0 = úplný) | 0.0 | podíl |
| `collision.enemySqueezeFactor` | protažení kolem cizího | 0.5 | podíl |

### Aréna a životní cyklus scény
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `arena.fullShrinkCount` | počet entit, kdy je plocha nejmenší | ~4 | ks |
| `arena.minSizeFactor` | nejmenší rozměr arény | 0.30 | podíl plátna |
| `arena.smooth` | rychlost dotahování rozměru | 0.02–0.1 | podíl/snímek |
| `arena.panelMinFraction` / `panelMaxFraction` | šířka panelu min / max | 0.20 / 0.30 | podíl šířky |
| `scene.winnerHold` | jak dlouho 1 frakce, než scéna skončí | 45 | snímky |
| `scene.fadeOutFrames` / `fadeInFrames` | délka fadu ven / dovnitř | 80 | snímky |
| `scene.introLineDelay` / `introLineFade` | rozsvěcení řádků / náběh | 36 / 32 | snímky |
| `scene.introHold` / `outroHold` | držení titulků / vítěze | 260 / 130 | snímky |
| `scene.zonesPerFaction` | startovních zón na frakci | 1–8 | ks |
| `scene.minZoneDistance` | min. odstup zón (chytře se zmenší) | ~200 | px |
| `scene.spawnZoneRadius` | poloměr zóny | 0.06 | podíl menší strany |

### Hlad, lov, energie, stamina
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `hunt.hungerStart` | počáteční hlad (rozsah) | [0, 0.2] | stav 0..1 |
| `hunt.hungerRate` | přírůstek hladu v čase | 0.0011 | stav/snímek |
| `hunt.huntThreshold` | práh hladu pro lov | 0.45 | stav 0..1 |
| `hunt.satiationFull` | energie, nad níž je „sytá" (neloví, zpomalí) | 1.0 | stav |
| `hunt.satiatedSpeedFactor` | zpomalení syté entity | 0.5 | násobek cruise |
| `hunt.feedFactor` | jak silně jídlo **tiší hlad** | 1.0 | násobič |
| `hunt.pursueWeight` / `predictFrames` | síla honu / predikce | 2.4 / 12 | váha / snímky |
| `hunt.lockFrames` / `maxChase` | závazek k cíli / vzdání | 50 / 160 | snímky / px |
| `energy.start` | počáteční energie (rozsah) | [0.6, 1.0] | stav |
| `energy.metabolism` / `sprintDrain` | pokles klid / sprint | 0.00005 / 0.0005 | stav/snímek |
| `energy.maxEnergy` / `minCruise` | strop (lze se přejíst) / cruise při 0 | 1.3 / 0.45 | stav / podíl |
| `stamina.regen` / `drain` | regenerace / vybíjení | 0.012 / 0.020 | stav/snímek |
| `stamina.sprintMult` / `windedFactor` | rychlost sprintu / zadýchání | 1.8 / 0.6 | násobek cruise |
| `stamina.engageRange` / `panicRange` | kdy sprint lov / útěk | 72 / 82 | px |

### Strach, odvaha, deterrence, útěk, ochrana, healing
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `courageStart` | počáteční odvaha (rozsah, neměnná) | [0.2, 0.85] | stav 0..1 |
| `strengthStart` | síla (rozsah, neměnná, **viditelná**) | [0.7, 1.3] | násobič |
| `character.protectorRatio` | podíl PROTECTOR (zbytek ATTACKER) | 0.5 | podíl |
| `fear.riseRate` / `decay` / `safeDecayBonus` | růst / pokles / v bezpečí | 0.05 / 0.01 / 0.02 | stav/snímek |
| `fear.baseThreat` / `hungerThreat` | pasivní hrozba cizího / příspěvek jeho hladu | 0.15 / 0.25 | příspěvek hrozby |
| `fear.predatorMenace` / `targetedBonus` | děsivost lovce / „jde po mně" | 0.45 / 0.6 | příspěvek hrozby |
| `fear.allyBravery` / `allyBraveryMax` | odvaha za člena squadu / strop | 0.05 / 0.35 | stav |
| `fear.hungerBravery` | **hlad → odvaha** (desperation) | 0.6 | stav |
| `fear.fightCourage` | práh odvahy „postavit se a bojovat" | 0.6 | stav |
| `fear.fightBiasRange` / `trappedFrames` / `breakOffFear` | sklon boj-útěk / past / vytržení z boje | 0.15 / 30 / 0.92 | stav / snímky / stav |
| `deter.numMin` / `numMax` | meze škály silové převahy | 0.3 / 2.5 | násobič |
| `deter.baseRatio` | potřebná převaha k útoku | 1.1 | poměr sil |
| `deter.hungerBravado` / `attackerBravado` | sleva za hlad / ATTACKER | 0.8 / 0.25 | poměr |
| `flee.weight` / `toAlliesWeight` | síla útěku / k spojencům | 2.8 / 1.6 | váha |
| `flee.jukeIntervalFrames` / `jukeStrength` | klička jak často / síla | [16,34] / 1.2 | snímky / váha |
| `protect.weight` / `allyFearTrigger` | síla obrany / práh strachu spojence | 2.2 / 0.4 | váha / stav |
| `protect.interposeBias` / `riskMargin` | kam se vmezeří / rezerva rizika | 0.45 / 0.15 | podíl / stav |
| `heal.seekThreshold` / `seekBoost` | „zraněn" pod / boost koheze | 0.45 / 2.0 | stav / násobič |
| `heal.comfortThreshold` / `donorRate` | komfort / tempo darování | 0.55 / 0.0012 | stav / stav/snímek |
| `charMods` | modifikace vah dle povahy (kohéze, protect, práh lovu, pursue, rally) | — | násobiče / posun |

### Souboj (ukusování)
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `combat.biteRange` | dosah, na který se ukusuje | 14 | px |
| `combat.biteBase` | základní ukousnutí (×síla ×stamina) | 0.011 | stav/snímek |
| `combat.biteEfficiency` | kolik z ukousnutého se vstřebá (zbytek = režie) | 0.85 | podíl |
| `combat.exertionEnergy` / `exertionStamina` | výdej energie / staminy v boji | 0.0006 / 0.018 | stav/snímek |
| `combat.engagedSeparation` | ztlumení odstupu od bojujícího spojence | 0.2 | násobič |
| `combat.maxAttackersPerTarget` | kolik nepřátel smí útočit na jeden cíl (1 = férový 1v1) | 5 | ks |
| `combat.slotRange` | jak blízko musí útočník být, aby „obsadil slot" cíle | 90 | px |

### Squady a rally (skupinová taktika)
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `squad.radius` | dosah připojení spojence k squadu (řetězí se) | 70 | px |
| `squad.sightRange` | kolektivní dohled squadu na nepřátele | 120 | px |
| `squad.overwhelm` | poměr síly, nad nímž je útok povinný (vypne opatrnost) | 2.2 | poměr |
| `rally.weight` / `threshold` | síla rally / práh ochoty pomoct | 1.8 / 0.5 | váha / skóre |
| `rally.maxRange` | dál od ohniska boje se nerozbíhá | 280 | px |
| `rally.courageW` / `fearW` / `advW` | vliv odvahy / strachu / převahy na ochotu | 0.35 / 0.45 / 0.3 | váha |
| `rally.tiredHold` / `desperation` | práh únavy pro 2. linii / poměr, kdy se i hájení zapojí | 0.4 / 0.9 | stav / poměr |

### Tlačenice a setrvačnost rozhodnutí
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `crowd.radius` / `full` / `minFactor` | poloměr / počet pro max zpomalení / nejnižší rychlost | 22 / 5 / 0.55 | px / ks / podíl |
| `decision.holdFrames` / `jitter` | jak dlouho se drží postoj / náhodný přídavek | 20 / 14 | snímky |
