# Stav implementace (znalosti o aplikaci)

Původní zadání projektu je v [`docs/ZADANI.md`](docs/ZADANI.md). Níže je popis **toho, co je hotové a jak je to
postavené** — aby se v projektu dalo rychle zorientovat a ladit.

## Pravidla práce (Petr)

- **Každá změna kódu se promítne do `README.md` ve stejném kroku jako kód**, bez připomínání, je to součást hotové
  práce: popis modelu chování (sekce „Jak to funguje — model chování“) i referenční tabulka konfigurace
  (sekce „Konfigurace (`CONFIG`)“), když parametr přibude, zmizí nebo změní význam, rozsah či jednotku. Stejně drž
  v souladu tento soubor a komentáře u polí `CONFIG`.
- **`TODO.md` je průběžná roadmapa:** hotové označ, nové nápady dej do backlogu.
- **Návrh mechaniky je otevřený dialog s Petrem a domluví se před kódem:** shrň, jak zadání chápeš, otevřené otázky
  polož prózou. Drobná čísla neřeš otázkou: zvol rozumný výchozí a řekni, že jde vyladit v `CONFIG`.
- **Radši znovu použij existující stav a systémy než nový stav** (příklad: `energy` je zároveň život v souboji).
- Stavěj po pojmenovaných vrstvách a chování lad pozorováním (`−`/`+` zpomalí a zrychlí simulaci).

## Soubory
- `index.html` — stránka, načítá p5.js z CDN, `sketch.js`, a zobrazuje horní
  nápovědu kláves.
- `sketch.js` — **vše** (jeden soubor).
- `README.md` — popis projektu a spuštění.
- `TODO.md` — **roadmapa**: hotové mechaniky, rozdělané, a backlog (klany,
  skrytý skill, hluk z bojiště, mršina). Sem koukni, než začneš na chování.

Spuštění: otevřít `index.html`, nebo `python -m http.server 8123` →
`http://localhost:8123/index.html`.

## Struktura `sketch.js` (shora dolů)
1. **`CONFIG`** — všechny laditelné parametry na jednom místě (fyzika, vnímání,
   boids+osobní prostor, hunt/energie/stamina, **combat** (ukusování), **crowd**
   (tlačenice), fear+desperation/flee/protect, deterrence, **squad**, **rally**,
   **decision** (setrvačnost), healing, kolize, aréna, scéna). **Tady se ladí
   chování.**
2. **`SHAPES`** — jednotkové polygony tvarů frakcí (míří +x).
3. **`NAME_SETS`** — tematické slovníky (svět + frakce): Klingon, Duna, severská
   mytologie, sci-fi, Řím, hmyzí úl, elfové.
4. **`PLANET_TYPES`** — archetypy planet (palety pásů + parametry) + `rgb2hsv`/
   `hsv2rgb` pro per-instanci posun odstínu.
5. **`SpatialGrid`** — prostorová mřížka pro hledání sousedů (ne O(n²)).
6. **`Entity`** — stav + steering (separation/alignment/cohesion, perceive,
   pursue, flee, juke, protect, receiveHealing) + rozhodování/lov
   (`willingToAttack`, `pickPrey`) + souboj (`doBite`) + `update()` (jeden krok
   se setrvačností rozhodnutí) + `render()`/`renderDebug()`.
7. **Squady/scéna** — `buildSquads` (shlukování + agregáty), `countAttackers`
   (sloty cíle), `convexHull`, `generateLore`, `makePlanet`,
   `generateSpawnZones`/`spawnScene`, `startNewScene`, `processDeaths`,
   `updateSceneState`, `updateArena`, `confineToArena`, `resolveOverlaps`.
8. **Render** — `draw` (hlavní smyčka s rychlostí simulace `simSpeed`),
   `drawWorldBackground`, `drawArena`, `drawSquads`/`drawSquadLabels` (debug),
   `drawCommentary` (panel vpravo), `drawIntro`/`renderPlanet`, `drawOutro`,
   `drawFade`, `drawLegend`/`drawLegendHint`, `drawNeighborProbe`, `drawHud`.

## Klíčové systémy (a kde se ladí)
- **Pohyb**: steering + **setrvačnost** — směr se za snímek natočí jen o omezený
  úhel klesající s rychlostí (`CONFIG.turn`). Wander přes Perlin noise
  (`CONFIG.wander`). **Tlačenice**: namačkaná těla zpomalují průchod (`CONFIG.crowd`).
- **Vnímání**: zorný kužel + proxy (`CONFIG.perception`).
- **Osobní prostor**: každá entita má při spawnu vlastní preferovaný odstup
  v separaci (`CONFIG.boids.personalSpace`) — hejno nevypadá mřížkovaně.
- **Squady (sdílená informační vrstva)**: `buildSquads()` každý snímek shlukne
  spojence stejné frakce union-findem dle blízkosti (`CONFIG.squad.radius`;
  řetězí se → „žížaly", rozpad vzniká přirozeně). Squad sdílí `size`, `power`
  (Σ `strength × zdraví`) a **kolektivní odhad nepřítele** (`enemyPower`/těžiště
  z *viditelných* nepřátel = mlha války). Rozhodování čte sílu CELÉ skupiny,
  ne jen vnímaných sousedů → commitnou se i nevyrovnané boje.
- **Role/lov**: dynamické dle hladu; commitment lock (`CONFIG.hunt`). `pickPrey`
  respektuje **cap útočníků na cíl** (`combat.maxAttackersPerTarget`; slot
  „obsadí" jen útočník blíž než `combat.slotRange` — kulhající stragglery sloty
  neblokují).
- **Souboj (melee, `doBite`)**: dotyk **NENÍ smrt**. Útočník i obránce si
  navzájem **ukusují ENERGII** (= život); tempo = `strength × stamina`
  (zadýchaný kouše slaběji). Z ukousnutého se vstřebá `combat.biteEfficiency`,
  zbytek + exertion mizí → energie ze světa ubývá → duel vždy spěje k vítězi,
  vítěz je vyčerpaný. **Jedení tiší hlad** (`hunt.feedFactor`). Útočník a jeho
  cíl se smí překrývat (válení) — viz kolize.
- **Energie/hlad**: cruise rychlost ∝ energie; smrt při energii 0. Hlad roste
  v čase a **klesá jedením**. Sytost = plné břicho (energie ≥ `hunt.satiationFull`
  → přestane shánět nové cíle, zpomalí). Jediný zdroj energie je sežrat někoho;
  systém je **ztrátový** (overhead + exertion) → svět se časem vykrvácí
  (`CONFIG.energy`, `.stamina`, `.combat`).
- **Strach/odvaha (desperation)**: hrozivost cizího pramení hlavně z **aktivního
  lovu / „jde po mně"** (jen mírně z jeho hladu — `fear.baseThreat/hungerThreat`),
  škálovaná **poměrem síly squadů**. Odvaha = `courage` + velikost squadu +
  **HLAD** (`fear.hungerBravery` → hladový riskuje až běsní; konec scény =
  hladové běsnění, ne strnulost). Útěk vs. boj vs. klid s hysterezí, past
  (`trapped`), vytržení z boje (`breakOffFear`), individuální `fightBias`.
- **Setrvačnost rozhodnutí**: postoj (klid/útěk/boj/lov/rally) se drží
  `CONFIG.decision.holdFrames` a přehodnotí se až po vypršení / **tvrdém
  přerušení** (cíl či hrozba zmizí, panika, past) — žádné blikání každý snímek.
- **Rally (pomoc do boje)**: člen bez vlastního cíle vyrazí k těžišti nepřítele,
  které squad vidí kolektivně → zapojí se i zadáci (a vzniká obkličování
  z více směrů). Ochota `helpDesire` = role + odvaha − strach + převaha squadu;
  unavený/zraněný drží **2. linii**, dokud squad vede (`CONFIG.rally`).
- **Deterrence/emboldenment**: `willingToAttack` porovná **power squadu vs
  viditelný `enemyPower`**; drtivá převaha (`squad.overwhelm`) → **povinný
  commit**. Síla i zranění cíle jsou VIDITELNÉ (`CONFIG.deter`, `.squad`).
- **Healing**: zraněný lne k hejnu (mimo boj a útěk), zdraví darují přebytek
  energie nad komfortem (`CONFIG.heal`).
- **Kolize**: tvrdé rozhrnutí, podlaha **PODLE DVOJICE** — sevření spojenců
  u fronty, **překryv útočník↔cíl** (válení v boji), protažení kolem cizího
  na těsno (`CONFIG.collision`).
- **Aréna**: smršťuje se s úbytkem entit, **asymetricky** (vpravo roste panel
  komentáře); `confineToArena` drží entity uvnitř (`CONFIG.arena`).

## Životní cyklus scény (`sceneState`)
`INTRO` (animovaná planeta + titulky, simulace stojí) → `ACTION` (fade-in,
simulace běží, hlídá se vítěz) → `OUTRO` (fade do černé, vyhlášení vítěze
+ příčina prohry) → nový příběh → `INTRO` … Počet frakcí 2–6 (`factionsRange`),
populace se dělí mezi ně, spawn ve více rozesetých zónách s min. odstupem
(chytře se zmenší, když je nereálný).

## Planeta a pozadí
`makePlanet()` jednou za scénu vygeneruje equirektangulární texturu vzorkováním
šumu **na 3D kouli** (izotropní kontinenty, bez pruhů), s výškovými pásy, biomy,
hillshade a póly; předpočítá geometrii koule + osvětlení. `renderPlanet` pak za
běhu jen levně „roluje" texturu (rotace) v offscreen bufferu. Stejná textura
slouží i jako tlumené **pozadí hrací plochy** (`drawWorldBackground`).

## Ovládání
`H` legenda (vizuální stavy + pravidla), `Mezerník` pauza, `D` detaily (debug
overlay — vč. obálek squadů), `R` nová scéna, `−`/`+` zpomalit/zrychlit
simulaci (slow-motion pro pozorování), `0` normální rychlost.

## Výkon
Cíl ~60 FPS při ~100–200 entitách. Spatial grid se přestavuje každý snímek;
planeta se generuje jen jednou za scénu (krátký zádrhel na černé je OK).

