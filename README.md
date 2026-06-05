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
- **D** — detailní (debug) overlay: zorné kužely, proxy, vektory sil, sonda
- **R** — restart / nová scéna

## Co se ve scéně děje

- Entita má **frakci** (barva + tvar), dynamickou **roli** (predátor/kořist),
  stálou **povahu** (ochránce/útočník) a vnitřní stav: **hlad, strach, odvahu,
  energii a staminu**.
- **Vnímání**: zorný kužel ve směru pohybu + malý „proxy" poloměr (sluch).
- **Lov**: hladová entita pronásleduje cizí kořist (s predikcí pohybu),
  po úlovku se nasytí a chvíli odpočívá.
- **Strach vs. odvaha**: kořist prchá (tři strategie — k hejnu, klička, smůla),
  ochránci se vmezeřují mezi spojence a hrozbu.
- **Síla v počtech**: přesila láká k útoku, sevřené hejno útočníka odradí;
  vtržení predátora hejno rozprašuje.
- **Energie a stamina**: pohyb řídí zásoba sil (kdo dlouho nejedl, slábne a může
  umřít hlady) a krátkodobý sprint (přepálení → zadýchání). Zranění se léčí
  v hejnu, kde jim zdraví spojenci darují energii.
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

**Role (dynamická, přepočítává se každý snímek):**
- `PREDATOR` (lovec) vs. `PREY` (kořist) — **není napevno!** Entita se stává
  lovcem, jen když má hlad nad prahem, neutíká, není nasycená a vidí kořist,
  na kterou si troufne. Jinak je kořist.

**Vnitřní stavy (0..1, dynamické):**
- **Hlad (`hunger`)** — roste v čase; nad prahem pohání lov. Po úlovku spadne
  (nasycení) a entita chvíli neloví.
- **Energie (`energy`)** — dlouhodobá „síla". Klesá metabolismem (sprint rychleji),
  doplní se úlovkem. **Při 0 = smrt hladem.** Řídí cruise rychlost.
- **Stamina** — krátkodobý sprint. Vybíjí se během sprintu, regeneruje v klidu.
  Vyčerpání → **zadýchání** (dočasné zpomalení).
- **Strach (`fear`)** — roste přítomností hrozby, klesá v bezpečí. Proti odvaze
  rozhoduje útěk vs. setrvání.

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
- **Strach vs. odvaha (+ hejno):** rozhoduje útěk/obranu. Blízké hejno dodává
  odvahu (čím víc spojenců, tím statečnější, do stropu).
- **Početní převaha:** jeden výpočet poměru sil (já + spojenci vs. cizí + jeho
  spojenci) řídí **současně** strach (přečíslený cizí je míň děsivý) i ochotu
  zaútočit.

### Rozhodovací logika (každý snímek, v pořadí priorit)
1. **Vnímání** → rozdělí okolí na spojence a cizí; spočítá vlastní „sílu hejna".
2. **Hrozba a strach** → z cizích spočítá míru ohrožení (hlad cizího × početní
   poměr + bonus, pokud aktivně loví nebo **jde přímo po mně**), z toho roste
   strach a směr „pryč od hrozeb".
3. **Útěk?** Pokud `strach > odvaha` (s hysterezí, ať to nebliká) → **režim
   útěku** (potlačí lov i poflakování).
4. **Lov?** Pokud neutíká, má hlad a vidí kořist, na kterou si troufne → **lov**.
   Cíl si **drží se závazkem** (commitment) i krátce mimo dohled, dokud ho
   nechytí, neztratí (moc daleko), nebo ho neodradí přesila.
5. **Léčení** zraněného (viz níže).
6. **Energie/stamina/rychlost** → spočítá aktuální max rychlost a případný sprint.
7. **Síly pohybu** (váženo poměrem podle role/povahy/stavu): rozestup +
   srovnání směru + soudržnost hejna, a navrch buď útěk, lov, ochrana, nebo
   poflakování; nakonec odpor od kraje arény.
8. **Setrvačnost** → směr se smí otočit jen o omezený úhel (klesá s rychlostí):
   rychlý dělá široké oblouky, pomalý kličkuje ostře; z pravé do levé zatáčky
   se vždy projde rovně (žádné skoky).

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

### Lov a skupinové napadání (síla v počtech)
- Lovec míří na **nejbližší vnímanou kořist, na kterou si troufne** (predikuje
  její budoucí pozici) a na blízko **vystartuje sprintem**; v dosahu úlovku ji
  sní (nasytí se, doplní energii).
- **Deterrence:** na kořist obklopenou **velkým, sevřeným hejnem** lovec
  nezaútočí — hrozí, že „dostane nařez". Čím větší ochrana kořisti, tím nižší
  ochota. Hlad a povaha ATTACKER tu opatrnost srážejí (zoufalý/útočný riskuje).
- **Emboldenment (opak):** je-li cizí **přečíslený**, spojenci se ho přestanou
  bát a **společně ho doženou** — vzniká přirozené skupinové napadání osamělců.

### Strach, útěk a rozpad hejna (panika)
Když se entita rozhodne utéct, podle situace volí strategii:
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
| `perception.visionRange` | dosah zorného kužele | 80–120 | px |
| `perception.visionAngle` | šíře kužele | 100–160 | ° |
| `perception.proxyRange` | „sluch" kolem dokola | 25–45 | px |
| `grid.cellSize` | buňka mřížky (≥ největší dotaz) | ~60 | px |
| `boids.separationRange` / `…Weight` | odstup / síla rozestupu | 32 / 2.6 | px / váha |
| `boids.alignmentWeight` / `cohesionWeight` | srovnání směru / držení hejna | 1.0 / 0.9 | váha |
| `collision.bodyRadius` | poloměr těla (2× = min. odstup) | 5–8 | px |
| `collision.iterations` / `push` | průchody / díl rozhrnutí | 2 / 0.5 | ks / podíl |

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
| `hunt.hungerRate` | přírůstek hladu | 0.0011 | stav/snímek |
| `hunt.huntThreshold` | práh hladu pro lov | 0.45 | stav 0..1 |
| `hunt.killRange` | vzdálenost úlovku | 12 | px |
| `hunt.satiationFrames` | délka nasycení | 180 | snímky |
| `hunt.pursueWeight` / `predictFrames` | síla honu / predikce | 2.4 / 12 | váha / snímky |
| `hunt.lockFrames` / `maxChase` | závazek k cíli / vzdání | 50 / 160 | snímky / px |
| `energy.start` | počáteční energie (rozsah) | [0.6, 1.0] | stav 0..1 |
| `energy.metabolism` / `sprintDrain` | pokles klid / sprint | 0.0001 / 0.0005 | stav/snímek |
| `energy.eatGain` / `maxEnergy` | doplnění úlovkem / strop | 0.6 / 1.3 | stav |
| `energy.minCruise` | cruise při energii 0 (násobek base) | 0.45 | podíl |
| `stamina.regen` / `drain` | regenerace / vybíjení | 0.012 / 0.020 | stav/snímek |
| `stamina.sprintMult` / `windedFactor` | rychlost sprintu / zadýchání | 1.8 / 0.6 | násobek cruise |
| `stamina.engageRange` / `panicRange` | kdy sprint lov / útěk | 72 / 82 | px |

### Strach, odvaha, deterrence, útěk, ochrana, healing
| Parametr | Význam | Rozsah | Jednotka |
|---|---|---|---|
| `courageStart` | počáteční odvaha (rozsah, neměnná) | [0.2, 0.85] | stav 0..1 |
| `character.protectorRatio` | podíl PROTECTOR (zbytek ATTACKER) | 0.5 | podíl |
| `fear.riseRate` / `decay` / `safeDecayBonus` | růst / pokles / v bezpečí | 0.05 / 0.01 / 0.02 | stav/snímek |
| `fear.predatorMenace` / `targetedBonus` | děsivost lovce / „jde po mně" | 0.45 / 0.6 | příspěvek hrozby |
| `fear.allyBravery` / `allyBraveryMax` | odvaha za spojence / strop | 0.05 / 0.35 | stav |
| `deter.numMin` / `numMax` | meze škály početní převahy | 0.3 / 2.5 | násobič |
| `deter.baseRatio` | potřebná převaha k útoku | 1.1 | poměr sil |
| `deter.hungerBravado` / `attackerBravado` | sleva za hlad / ATTACKER | 0.8 / 0.25 | poměr |
| `flee.weight` / `toAlliesWeight` | síla útěku / k spojencům | 2.8 / 1.6 | váha |
| `flee.jukeIntervalFrames` / `jukeStrength` | klička jak často / síla | [16,34] / 1.2 | snímky / váha |
| `protect.weight` / `allyFearTrigger` | síla obrany / práh strachu spojence | 2.2 / 0.4 | váha / stav |
| `protect.interposeBias` / `riskMargin` | kam se vmezeří / rezerva rizika | 0.45 / 0.15 | podíl / stav |
| `heal.seekThreshold` / `seekBoost` | „zraněn" pod / boost koheze | 0.45 / 2.0 | stav / násobič |
| `heal.comfortThreshold` / `donorRate` | komfort / tempo darování | 0.7 / 0.0012 | stav / stav/snímek |
| `charMods` | modifikace vah dle povahy (kohéze, protect, práh lovu, pursue) | — | násobiče / posun |
