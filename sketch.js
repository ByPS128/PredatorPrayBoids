'use strict';

/* =========================================================================
 *  Boids — Predator / Prey  (p5.js)
 *
 *  Krok 1 implementace:
 *   - kostra p5.js + CONFIG
 *   - třída Entity + základní steering pohyb (acceleration -> velocity -> position)
 *   - wander (poflakování se) když entita nikoho nevidí
 *   - ošetření okrajů plátna (měkké zatočení dovnitř)
 *   - ovládání: Mezerník = pauza, D = debug overlay, R = restart
 *
 *  Další kroky (spatial grid, boids, vnímání, role, hunger, fear...) přibudou
 *  postupně. Kód držím čitelný a parametrizovaný přes CONFIG.
 * ========================================================================= */

// -------------------------------------------------------------------------
//  CONFIG — všechny laditelné parametry na jednom místě
// -------------------------------------------------------------------------
const CONFIG = {
  // --- Scéna ---
  count: 90,                 // celkový počet entit (rozdělí se mezi frakce)
  factionsRange: [2, 6],     // počet frakcí se náhodně volí z tohoto rozsahu (včetně)

  // Paleta barev frakcí (RGB). Pro scénu se náhodně vybere podmnožina (až 6).
  palette: [
    [ 90, 200, 255],         // azurová
    [255, 110,  90],         // korálová / červená
    [150, 230, 110],         // zelená
    [200, 130, 255],         // fialová
    [255, 205,  70],         // zlatá
    [255, 110, 185],         // růžová
  ],
  background: [10, 14, 20],

  // --- Fyzika / pohyb ---
  maxSpeed: 2.6,             // základní max rychlost
  maxForce: 0.12,            // max síla otáčení (steering)
  minSpeedFactor: 0.25,      // ať se entita úplně nezastaví (násobek maxSpeed)

  // --- Setrvačnost / rychlost otáčení ---
  // Směr se smí za snímek natočit jen o omezený úhel (rad). Limit klesá
  // s rychlostí: rychlý dělá široké oblouky, pomalý kličkuje ostře. Z pravé
  // do levé zatáčky tak směr plynule projde rovně (žádné skoky).
  turn: {
    baseRate: 0.14,          // rad/snímek při referenční rychlosti
    speedRef: 2.0,           // rychlost, při které platí baseRate
    maxRate: 0.30,           // strop otáčení (i pomalý má limit, ať se netočí na místě)
    minRate: 0.045,          // spodní mez (i nejrychlejší se trochu stočí)
  },

  // --- Wander (plynulé poflakování přes Perlin noise) ---
  wander: {
    circleDist: 28,          // jak daleko před entitou je "wander kruh"
    circleRadius: 16,        // poloměr wander kruhu (menší = mírnější odchylky)
    noiseSpeed: 0.006,       // jak rychle se mění noise úhel (menší = plynulejší, líný meandr)
  },

  // --- Okraje plátna ---
  edge: {
    margin: 90,              // od jaké vzdálenosti od kraje začne entita zatáčet
    weight: 1.6,             // váha odpudivé síly od kraje
  },

  // --- Prostorové dělení (spatial grid) ---
  // cellSize by měl být >= největšího dotazovaného poloměru (neighborRange),
  // aby stačilo prohledat jen okolní buňky (3x3) místo všech entit.
  grid: {
    cellSize: 60,
  },

  // --- Vnímání (Perception) ---
  // Entita nevidí 360°. Vnímá ve dvou složkách:
  //  1) zorný kužel ve směru pohybu (visionRange + visionAngle),
  //  2) proxy spot — malý poloměr kolem dokola (sluch / blízká detekce).
  // Cokoli mimo kužel i mimo proxy entita "nevidí".
  perception: {
    visionRange: 105,         // dosah zorného kužele
    visionAngle: 130,        // úhel kužele ve stupních (celková šíře)
    proxyRange: 35,          // poloměr blízké detekce (sluch) — kolem dokola
  },

  // --- Boids (klasické hejnové chování v rámci frakce) ---
  boids: {
    separationRange: 32,     // pod touto vzdáleností se sousedé odpuzují (širší = vyhne se dřív)
    separationWeight: 2.6,   // síla "nenarážej do druhých" (měkké vyhýbání)
    alignmentWeight: 1.0,    // síla srovnání směru se spojenci
    cohesionWeight: 0.9,     // síla držet se ke středu hejna
    personalSpace: [0.8, 1.2], // OSOBNÍ PROSTOR: per-entita násobek separationRange (přiděleno
                               //   při spawnu) — mírný rozptyl, ať hejno nevypadá mřížkovaně
  },

  // --- Kolize (tvrdé rozhrnutí překryvů — těla se nesmí prolnout) ---
  // Pojistka nad rámec steeringu: po pohybu odsuneme dvojice, které se
  // překrývají, od sebe. Můžou se drcnout, ale ne projít skrz (jako lidi v davu).
  collision: {
    bodyRadius: 6,           // poloměr "těla"; dvě entity se nepřiblíží blíž než 2× tohle
    iterations: 2,           // počet relaxačních průchodů za snímek (víc = pevnější)
    push: 0.5,               // jak velký díl překryvu se odstraní za průchod (0.5 = symetricky půl/půl)
    // Při SOUBOJI se rozhrnovací podlaha změkčuje (násobky normální podlahy bodyRadius*2):
    allyTightFactor: 0.45,   // spojenci u fronty (aspoň jeden engaged) se smí přimáčknout na těsno
    combatOverlapFactor: 0.0,// útočník ↔ jeho cíl: 0 = smí se úplně překrýt (válejí se po sobě)
    enemySqueezeFactor: 0.5, // kolem NEbojujícího cizího se lze protáhnout na těsno (průnik do kotle)
  },

  // --- Aréna (smršťující se hrací prostor) ---
  // Když přeživších ubývá, prostor se plynule stahuje ke středu, aby se
  // poslední jedinci na velké ploše neminuli a příběh se dohrál.
  arena: {
    // Plocha se stahuje PLYNULE podle podílu žijících entit: plná při počáteční
    // populaci (CONFIG.count), nejmenší při fullShrinkCount → každé úmrtí ji zmenší.
    fullShrinkCount: 4,      // při tomto počtu (a méně) je plocha nejmenší
    minSizeFactor: 0.30,     // nejmenší rozměr arény (násobek plátna)
    smooth: 0.05,            // jak rychle se rozměr arény plynule dotahuje k cíli
    // ASYMETRIE: plocha se zužuje doleva, vpravo je panel s legendou/feedem.
    panelMinFraction: 0.20,  // šířka panelu hned od začátku (podíl šířky plátna)
    panelMaxFraction: 0.30,  // max šířka panelu (když je entit nejmíň)
  },

  // --- Životní cyklus scény ---
  scene: {
    winnerHold: 45,          // kolik snímků musí zbývat jediná frakce, než scéna skončí (~0,75 s)
    fadeOutFrames: 80,       // délka fade do černé
    fadeInFrames: 80,        // délka fade z černé do nové scény

    // intro (titulky) a outro (vyhodnocení)
    introLineDelay: 36,      // rozestup mezi rozsvícením řádků titulků (snímky)
    introLineFade: 32,       // jak dlouho řádek nabíhá (snímky)
    introHold: 260,          // jak dlouho titulky drží po dokončení (~4,3 s na přečtení)
    outroHold: 130,          // jak dlouho drží vyhlášení vítěze (snímky)

    zonesPerFaction: 4,      // kolik startovních zón má každá frakce (rozeseté po ploše)
    minZoneDistance: 200,    // min. bezpečná vzdálenost mezi VŠEMI zónami (px); když je
                             //   na plochu nereálná, aplikace ji sama chytře zmenší
    spawnZoneRadius: 0.06,   // poloměr jedné startovní zóny (násobek menší strany plátna)
  },

  // Wander se ztlumí, když má entita kolem sebe spojence (drží hejno),
  // a naplno běží, když je sama (poflakování / hledání).
  wanderLoneWeight: 1.0,     // váha wanderu když je entita sama
  wanderFlockWeight: 0.25,   // váha wanderu uvnitř hejna

  // --- Hunger, role a lov ---
  // role NENÍ napevno: entita se stává PREDATOR, když vyhladoví a uvidí
  // cizí kořist; jinak je PREY. Po nasycení dočasně neloví.
  hunt: {
    hungerStart: [0, 0.2],   // počáteční hlad (náhodně v rozsahu) — ať neflipnou všichni naráz
    hungerRate: 0.0011,      // přírůstek hladu za snímek (~7 s k prahu lovu)
    huntThreshold: 0.45,     // od jakého hladu je entita ochotná lovit (PREDATOR)

    // NASYCENÍ podle plného břicha (ne časovač po killu): jakmile energie přeleze
    // satiationFull, entita přestane shánět NOVÉ cíle a zpomalí. Po vyčerpávajícím
    // souboji (kde režie sežrala zisk) zůstane hladová a může lovit dál / léčit se.
    satiationFull: 1.0,      // nad touto energií je entita "sytá" (přestane shánět nové cíle)
    satiatedSpeedFactor: 0.5,// sytá entita zpomalí (násobek cruise rychlosti)
    feedFactor: 1.0,         // jak silně snědená porce TIŠÍ HLAD (hunger -= vstřebané × tohle)

    pursueWeight: 2.4,       // váha pronásledování kořisti
    predictFrames: 12,       // o kolik snímků dopředu predikovat pohyb kořisti
    huntCohesionFactor: 0.25,// uvnitř lovu se kohéze ke hejnu ztlumí
    lockFrames: 50,          // závazek k cíli: jak dlouho pronásleduje i mimo dohled (~0.8 s)
    maxChase: 160,           // nad tuto vzdálenost cíl vzdá (px)
  },

  // --- Souboj (ukusování, melee) ---
  // Dotyk NENÍ smrt. Útočník i obránce si navzájem ukusují ENERGII (= život).
  // Z ukousnutého se vstřebá jen část (biteEfficiency), zbytek je režie a MIZÍ ze
  // systému → energie ubývá → pat nevydrží → souboj vždy dospěje k vítězi. Vítěz
  // je vyčerpaný (boj žere energii i staminu) a může pak umřít hlady.
  combat: {
    biteRange: 14,           // na jakou vzdálenost se ukusuje (souboj na dotek/překryv)
    biteBase: 0.011,         // základní ukousnutí za snímek (×strength ×stamina)
    biteEfficiency: 0.85,    // kolik z ukousnutého se vstřebá (zbytek = režie, mizí) — vyšší = sežrání víc nakrmí
    exertionEnergy: 0.0006,  // přídavný výdej energie při souboji (boj vysiluje)
    exertionStamina: 0.018,  // výdej staminy při souboji (→ zadýchání → slabší kousnutí)
    engagedSeparation: 0.2,  // jak moc se ztlumí měkká separace od bojujícího spojence (≈ nahrň se k frontě)
    maxAttackersPerTarget: 5,// kolik nepřátel smí SOUČASNĚ útočit na jeden cíl (1 = férový 1v1)
    slotRange: 90,           // jen útočník blíž než tohle „obsadí slot" cíle — kulhající
                             //   stragglery (mrtvý lock daleko vzadu) sloty neblokují
  },

  // --- Tlačenice (protahování na těsno bere rychlost) ---
  crowd: {
    radius: 22,              // v jakém poloměru kolem sebe počítá namačkaná těla
    full: 5,                 // při tolika sousedech je zpomalení maximální
    minFactor: 0.55,         // nejnižší násobek rychlosti v plné tlačenici
  },

  // --- Squady (sdílená informační vrstva skupiny) ---
  // Spojenci stejné frakce se přes blízkost slévají do squadu (řetězí se →
  // „žížaly"). Squad sdílí AGREGÁTY: kolik nás je, jak jsme silní, a co
  // KOLEKTIVNĚ vidíme z nepřátel. Rozhodování (útok/strach) pak čte sílu
  // celé skupiny, ne jen vnímaných sousedů → nevyrovnané boje se commitnou.
  squad: {
    radius: 70,              // do jaké vzdálenosti se spojenec připojí k squadu (řetězení)
    sightRange: 120,         // dosah, na který squad KOLEKTIVNĚ vidí nepřátele (bez kužele)
    overwhelm: 2.2,          // poměr síly (náš/jejich), nad kterým se vypne opatrnost → commit
    debugFill: 20,           // alfa průhledného podbarvení squadu v debug pohledu
  },

  // --- Energie (dlouhodobá rezerva "síly") ---
  // Klesá v čase (metabolismus), sprint ji ubírá rychleji. Cruise rychlost
  // se od ní odvíjí → kdo dlouho nejedl, slábne a zpomaluje. Při 0 = smrt hladem.
  energy: {
    start: [0.6, 1.0],       // počáteční rezerva (náhodně v rozsahu)
    metabolism: 0.00005,     // základní pokles za snímek (běžný život ubírá pomalu, ať se nehladoví zbytečně)
    sprintDrain: 0.0005,     // přídavný pokles při sprintu
    maxEnergy: 1.3,          // strop — lze se "přejíst" na rezervu nad 100 % (štědřejší dárce)
    minCruise: 0.45,         // cruise rychlost při energii=0 (násobek base; při energii=1 je to base)
  },

  // --- Skupinový healing (zranění/nízká energie + pomoc hejna) ---
  // Zraněná entita lne k hejnu; zdraví spojenci jí postupně darují energii
  // ze svého PŘEBYTKU nad komfortní mezí. Dárci nikdy neklesnou pod komfort.
  heal: {
    seekThreshold: 0.45,     // pod touto energií se entita cítí zraněná → silněji vyhledá hejno
    seekBoost: 2.0,          // násobek koheze ke spojencům, když je zraněná
    comfortThreshold: 0.55,  // hranice komfortu: dárce dává jen z přebytku nad ní, příjemce se hojí jen do ní
    donorRate: 0.0012,       // podíl přebytku dárce odevzdaný za snímek (postupně v čase)
  },

  // --- Stamina (krátkodobý sprint) ---
  stamina: {
    start: [0.7, 1.0],
    regen: 0.012,            // regenerace za snímek při klidovém cruise
    drain: 0.020,            // vybíjení za snímek při sprintu
    sprintMult: 1.8,         // rychlost sprintu = cruise * tato hodnota
    windedFactor: 0.6,       // "zadýchaný": násobek cruise, dokud se nenadýchá
    recoverThreshold: 0.4,   // zadýchání pomine, až stamina vyleze nad tuto mez
    engageRange: 72,         // predátor vystartuje, když je kořist blíž než tohle
    panicRange: 82,          // kořist vystartuje, když je hrozba blíž než tohle
    rangeHysteresis: 1.3,    // už sprintující drží sprint do 1.3× dosahu (proti blikání)
  },

  // --- Character (povaha — neměnná, přiděluje se při spawnu) ---
  character: {
    protectorRatio: 0.5,     // podíl PROTECTOR (zbytek ATTACKER)
  },
  courageStart: [0.2, 0.85], // počáteční odvaha (náhodně v rozsahu), neměnná
  // SÍLA — povahová konstanta, VIDITELNÁ (soupeř ji při rozhodování o útoku zváží).
  // Moduluje tempo ukusování i deterrence. Později ji bude přebíjet klan; skrytý
  // "skill" (mířit na slabiny, uhýbat) přijde v další fázi a vidět NEbude.
  strengthStart: [0.7, 1.3],

  // --- Fear (strach — dynamický) ---
  fear: {
    riseRate: 0.05,          // jak rychle roste při hrozbě
    decay: 0.010,            // přirozený pokles za snímek
    safeDecayBonus: 0.02,    // rychlejší pokles v bezpečí (spojenci, žádná hrozba)
    // SLOŽENÍ HROZIVOSTI cizího (× powerFactor): hrozba pramení hlavně z toho, že
    //   po mně aktivně jde, ne z toho, že má taky hlad. (Dřív byl hladový člen
    //   dominantní → ke konci scény měl hlad každý → všichni se báli všech.)
    baseThreat: 0.15,        // pasivní: cizí prostě v dosahu
    hungerThreat: 0.25,      // mírný přídavek za jeho hlad (utlumeno z původního ~1.0)
    predatorMenace: 0.45,    // o kolik je děsivější aktivně lovící predátor (bezprostřední, čísly neškálováno)
    targetedBonus: 0.6,      // přídavek strachu, když si mě cizí vybral za kořist ("jde po MNĚ")
    threatGate: 0.3,         // od jaké hrozivosti se cizí počítá jako reálná hrozba
    fleeHysteresis: 0.12,    // útěk se nevypne hned na prahu (proti blikání rozhodnutí)
    allyBravery: 0.05,       // o kolik dodá odvahy každý blízký spojenec
    allyBraveryMax: 0.35,    // strop bonusu odvahy od hejna
    hungerBravery: 0.6,      // HLAD DĚLÁ ODVAHU (až šílenství): hladový riskuje a útočí
                             //   místo aby se bál — konec scény = hladové běsnění, ne strnulost

    // ROZHODNUTÍ útěk vs. POSTAVIT SE A BOJOVAT (když je entita pod tlakem):
    fightCourage: 0.6,       // od jaké (hejnem posílené) odvahy se místo útěku otočí a bojuje
    fightBiasRange: 0.15,    // per-entitní náhodný posun prahu boj/útěk (individualita, ne strojové)
    trappedFrames: 30,       // kolik snímků marného útěku (nedaří se zvětšit odstup) → zoufalý boj
    breakOffFear: 0.92,      // při tak vysokém strachu se i bojující pokusí vytrhnout a prchnout
  },

  // --- Setrvačnost rozhodnutí (anti-thrashing) ---
  // Jakmile entita zaujme postoj (lov / boj / útěk / klid), DRŽÍ ho aspoň pár
  // snímků a teprve pak ho přehodnotí — pokud ji dřív nepřeruší něco zásadního
  // (cíl zemřel/zmizel, hrozba zmizela, panika, zahnání do kouta). Brání blikání
  // rozhodnutí každý snímek kvůli šumu ve vstupech (kolísání síly squadu apod.).
  decision: {
    holdFrames: 20,          // minimální doba držení postoje (snímky ~0,33 s)
    jitter: 14,              // náhodný přídavek (ať nepřehodnocují všichni naráz)
  },

  // --- Deterrence / emboldenment (síla v počtech, krok 7) ---
  // Jeden výpočet početní převahy: ovlivňuje strach (potenciální hrozba se
  // škáluje poměrem sil) i ochotu zaútočit (willingToAttack).
  deter: {
    numMin: 0.3,             // dolní mez škály početní převahy (přečíslený cizí = méně děsivý)
    numMax: 2.5,             // horní mez (cizí s velkým hejnem = děsivější)
    baseRatio: 1.1,          // potřebná převaha (moje_síla/jeho_ochrana) k útoku
    hungerBravado: 0.8,      // hlad sráží potřebnou převahu (zoufalý riskuje i v přesile soupeře)
    attackerBravado: 0.25,   // ATTACKER riskuje útok víc
    minNeed: 0.25,           // spodní mez potřebné převahy (i zoufalec má jistou opatrnost)
  },

  // --- Útěk (3 strategie) ---
  flee: {
    weight: 2.8,             // základní váha útěku (násobí se mírou strachu)
    toAlliesWeight: 1.6,     // přitažlivost ke spojencům při útěku (strategie 1)
    jukeIntervalFrames: [16, 34], // jak často kličkovat (strategie 2)
    jukeStrength: 1.2,       // síla zalomení trasy (klička jako zajíc)
  },

  // --- Protect (PROTECTOR brání ohroženého spojence) ---
  protect: {
    weight: 2.2,             // váha vmezeření mezi spojence a hrozbu
    allyFearTrigger: 0.4,    // od jakého strachu spojence ho protector řeší
    interposeBias: 0.45,     // 0=u spojence, 1=u hrozby (kam se vmezeří)
    riskMargin: 0.15,        // bezpečnostní rezerva; když je risk > odvaha+margin, pomoc odmítne
  },

  // Modifikace vah podle charakteru
  charMods: {
    PROTECTOR: { cohesion: 1.4, protect: 1.0, huntThresholdAdd: 0.15, pursue: 0.85, rally: 0.6 },
    ATTACKER:  { cohesion: 0.7, protect: 0.25, huntThresholdAdd: -0.15, pursue: 1.25, rally: 0.45 },
  },

  // --- Rally (přidat se ke skupinovému boji) — Vrstva B ---
  // Člen squadu, který sám nepřítele nevidí (nebo nemá vlastní cíl), se přidá
  // k boji = vyrazí k těžišti nepřítele, které squad KOLEKTIVNĚ vidí. Tím se
  // zapojí i zadáci a vznikne obkličování (přicházejí z více směrů).
  // Ochota (helpDesire) skládá: role (charMods.rally) + odvaha − strach
  // + bonus když squad vede; unavený/zraněný se drží v 2. linii, dokud squad
  // neprohrává (pak se do „last standu" zapojí i hájení).
  rally: {
    weight: 1.8,             // síla rally steeringu (k těžišti nepřítele)
    threshold: 0.5,          // od jakého helpDesire se entita zapojí
    maxRange: 280,           // dál než tohle od ohniska se nerozbíhá (nevidí smysl)
    courageW: 0.35,          // odvaha zvyšuje ochotu
    fearW: 0.45,             // strach snižuje ochotu
    advW: 0.3,               // převaha squadu: silní se hrnou (adv>1 →+), slabí necharí do prohry (adv<1 →−)
    tiredHold: 0.4,          // pod touto energií NEBO staminou se drží v 2. linii…
    desperation: 0.9,        // …dokud poměr síly (náš/jejich) neklesne pod tohle (pak jde i hájený)
  },

  // --- Vizuál ---
  entitySize: 9,             // velikost entity (délka)

  // Pozadí hrací plochy = ztmavený povrch planety z intra.
  worldBg: {
    tint: [125, 132, 146],   // násobící tint textury (nižší = tmavší pozadí)
    muteAlpha: 105,          // krytí tlumicí vrstvy základní barvy přes texturu (vyšší = tmavší/plošší)
  },
};

// -------------------------------------------------------------------------
//  Tvary entit (jednotkové polygony mířící +x; škálují se velikostí entity).
//  Každá frakce dostane jeden tvar — ať jsou na první pohled rozlišitelné.
// -------------------------------------------------------------------------
const SHAPES = [
  [[1, 0], [-0.6, 0.55], [-0.6, -0.55]],                 // 0 — trojúhelník
  [[1.2, 0], [-0.7, 0.42], [-0.35, 0], [-0.7, -0.42]],   // 1 — šipka s vrubem
  [[1.0, 0], [-0.15, 0.6], [-0.85, 0], [-0.15, -0.6]],   // 2 — kosočtverec / drak
  [[1.0, 0], [-0.5, 0.58], [-0.12, 0], [-0.5, -0.58]],   // 3 — ostrá šipka
  [[1.0, 0], [0.0, 0.5], [-0.7, 0.4], [-0.4, 0], [-0.7, -0.4], [0.0, -0.5]], // 4 — pětiúhel. šíp
  [[1.1, 0], [0.2, 0.45], [-0.7, 0.32], [-0.42, 0], [-0.7, -0.32], [0.2, -0.45]], // 5 — široký šíp
];

// -------------------------------------------------------------------------
//  Slovníky názvů — tematické sady (svět + frakce). Pro scénu se náhodně
//  vybere sada, z ní svět a tolik názvů frakcí, kolik je frakcí.
// -------------------------------------------------------------------------
const NAME_SETS = [
  { theme: 'Klingon',
    worlds: ["Qo'noS", 'Boreth', 'Rura Penthe', 'Khitomer', 'Morska', 'TyʼGokor'],
    factions: ['Dům Duras', 'Dům Mogh', 'Dům Martok', 'Dům Kor', 'Dům Gowron', 'Dům Korath'] },
  { theme: 'Duna',
    worlds: ['Arrakis', 'Caladan', 'Giedi Prime', 'Kaitain', 'Salusa Secundus', 'Ix'],
    factions: ['Atreides', 'Harkonnen', 'Corrino', 'Fremeni', 'Ordos', 'Tleilax'] },
  { theme: 'Severská mytologie',
    worlds: ['Yggdrasil', 'Ásgard', 'Midgard', 'Niflheim', 'Jötunheim', 'Vanaheim'],
    factions: ['Ásové', 'Vanové', 'Jötunové', 'Einherjar', 'Álfové', 'Dvergar'] },
  { theme: 'Lidská sci-fi',
    worlds: ['Terra Nova', 'Nový Eden', 'Helios', 'Tau Ceti', 'Aurora', 'Prometheus'],
    factions: ['Vanguarda', 'Koalice', 'Dominion', 'Konkord', 'Syndikát', 'Aliance'] },
  { theme: 'Antický Řím',
    worlds: ['Latium', 'Carthago', 'Tarsus', 'Numidia', 'Pannonia'],
    factions: ['Legio Prima', 'Praetoriáni', 'Vexilatio', 'Hastati', 'Triarii', 'Equites'] },
  { theme: 'Hmyzí úl',
    worlds: ["Zr'Khan", 'Xel-N33', 'Korr', 'Vespil', 'Chitar'],
    factions: ['Krvavý roj', 'Tichý úl', 'Hnízdo ostnů', 'Sféra', 'Klepeto', 'Larvál'] },
  { theme: 'Elfské državy',
    worlds: ['Eldoria', 'Silvanar', 'Avaloth', 'Mirkfell', 'Lúthien'],
    factions: ['Lesní sídla', 'Měsíční klan', 'Stínová léna', 'Jiskřiví', 'Trnoví', 'Mlžní'] },
];

// -------------------------------------------------------------------------
//  Archetypy planet — každý má vlastní paletu pásů (hluboké/mělké moře,
//  pobřeží, nížinná/horská vegetace, skály, vrcholy/sníh, led) a parametry
//  (poměr souš/voda, mraky, póly). Pro scénu se náhodně vybere jeden a navíc
//  se paletě posune odstín/sytost/jas → velká pestrost i u stejného typu.
// -------------------------------------------------------------------------
const PLANET_TYPES = [
  { name: 'terran',  deep:[12,40,90],  shoal:[28,100,135], beach:[206,196,150], low:[80,125,60],  high:[40,86,46],  rock:[120,104,80], peak:[238,242,250], ice:[235,240,250], sea:[0.48,0.58], cloudT:[0.55,0.68], cloudAmt:[0.6,0.9],  polar:[0.66,0.80] },
  { name: 'desert',  deep:[60,80,70],  shoal:[95,120,100], beach:[226,200,150], low:[205,155,95], high:[165,110,70],rock:[150,95,65],  peak:[225,212,192], ice:[228,224,218], sea:[0.16,0.32], cloudT:[0.70,0.82], cloudAmt:[0.12,0.4], polar:[0.80,0.92] },
  { name: 'ocean',   deep:[8,45,98],   shoal:[20,112,152], beach:[210,205,170], low:[85,132,72],  high:[45,95,55],  rock:[110,110,95], peak:[240,244,250], ice:[235,242,252], sea:[0.66,0.78], cloudT:[0.50,0.64], cloudAmt:[0.7,1.05], polar:[0.70,0.82] },
  { name: 'ice',     deep:[60,110,150],shoal:[125,172,202],beach:[212,224,234], low:[200,212,225],high:[226,236,246],rock:[150,165,185],peak:[248,250,255], ice:[245,248,255], sea:[0.40,0.54], cloudT:[0.50,0.64], cloudAmt:[0.5,0.85], polar:[0.40,0.55] },
  { name: 'jungle',  deep:[10,55,80],  shoal:[25,108,122], beach:[200,195,150], low:[50,125,52],  high:[20,80,35],  rock:[95,100,70],  peak:[230,238,235], ice:[235,240,245], sea:[0.42,0.55], cloudT:[0.46,0.58], cloudAmt:[0.85,1.15],polar:[0.74,0.86] },
  { name: 'volcanic',deep:[20,24,38],  shoal:[48,52,70],   beach:[85,72,70],    low:[78,58,56],   high:[48,40,42],  rock:[62,52,54],   peak:[225,95,40],   ice:[120,120,130], sea:[0.40,0.55], cloudT:[0.60,0.74], cloudAmt:[0.3,0.6],  polar:[0.86,0.96] },
  { name: 'amethyst',deep:[35,20,75],  shoal:[82,46,132],  beach:[202,172,202], low:[132,70,152], high:[90,45,112], rock:[112,92,122], peak:[236,230,246], ice:[236,232,246], sea:[0.45,0.60], cloudT:[0.55,0.68], cloudAmt:[0.4,0.8],  polar:[0.70,0.85] },
  { name: 'teal',    deep:[8,60,72],   shoal:[20,122,122], beach:[200,205,180], low:[60,142,112], high:[30,100,80], rock:[100,120,110],peak:[235,245,242], ice:[235,245,245], sea:[0.50,0.62], cloudT:[0.55,0.68], cloudAmt:[0.5,0.85], polar:[0.70,0.84] },
  { name: 'savanna', deep:[30,70,95],  shoal:[62,122,140], beach:[216,196,140], low:[172,152,82], high:[120,110,60],rock:[140,110,75], peak:[230,226,212], ice:[234,232,228], sea:[0.32,0.46], cloudT:[0.66,0.78], cloudAmt:[0.25,0.5], polar:[0.78,0.90] },
];

// RGB <-> HSV (pro posun odstínu/sytosti/jasu celé palety planety)
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = max(r, g, b), mn = min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - abs((h / 60) % 2 - 1)), m = v - c;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// -------------------------------------------------------------------------
//  Globální stav
// -------------------------------------------------------------------------
let entities = [];
let squads = [];             // shluky spojenců se sdílenou informací (přepočítává se každý snímek)
let grid;                    // SpatialGrid — přestavuje se každý snímek
let arena;                   // {x0,y0,x1,y1} — smršťující se hrací prostor
let paused = false;
let debug = false;
let showLegend = false;      // legenda vizuálních stavů + pravidel (klávesa H)
let simSpeed = 1;            // rychlost simulace (− zpomalí, + zrychlí); 1 = normál
let simAccumulator = 0;      // akumulátor pro běh < 1× (slow-motion běží 1 krok za 1/simSpeed snímků)

// životní cyklus scény: INTRO → ACTION → OUTRO → (nová scéna) → INTRO ...
let sceneState = 'INTRO';
let fadeAlpha = 1;           // 0 = scéna vidět, 1 = černá
let winnerTimer = 0;         // jak dlouho už zbývá jediná frakce
let winnerFaction = -1;      // frakce, která vyhrála
let introTimer = 0;          // odpočet rozsvěcení titulků
let outroTimer = 0;          // odpočet vyhlášení vítěze
let lore = null;             // aktuální "příběh": svět + frakce (název, barva, tvar, populace)
let events = [];             // feed komentáře: {text, color, alpha}
let factionStats = [];       // per frakce: {predation, starvation, kills, gone, lastOne}
let planet = null;           // procedurální planeta do intra (jiná každou scénu)
let planetBuffer = null;     // offscreen buffer pro vykreslení koule (recykluje se)

// -------------------------------------------------------------------------
//  SpatialGrid — prostorové dělení pro rychlé hledání sousedů
//
//  Plátno se rozdělí na čtvercové buňky o straně cellSize. Každá entita se
//  zatřídí do buňky podle své pozice. Dotaz "kdo je blízko bodu" pak stačí
//  prohledat jen buňky, které dotazovaný poloměr protíná — ne všech N entit.
//  Tím se vyhneme O(n²) porovnávání každý-s-každým.
// -------------------------------------------------------------------------
class SpatialGrid {
  constructor(w, h, cellSize) {
    this.cellSize = cellSize;
    this.cols = max(1, ceil(w / cellSize));
    this.rows = max(1, ceil(h / cellSize));
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  cellIndex(x, y) {
    const cx = constrain(floor(x / this.cellSize), 0, this.cols - 1);
    const cy = constrain(floor(y / this.cellSize), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  // zatřídí všechny entity do buněk (volá se jednou za snímek)
  build(items) {
    for (const cell of this.cells) cell.length = 0;
    for (const it of items) {
      this.cells[this.cellIndex(it.position.x, it.position.y)].push(it);
    }
  }

  // vrátí kandidáty v okolí bodu do vzdálenosti `range`
  //  - prohledá jen buňky, které poloměr protíná
  //  - vrací i entity těsně za hranicí buňky; přesné ořezání na vzdálenost
  //    si zajistí volající (porovná skutečnou distanci)
  query(x, y, range, out) {
    const result = out || [];
    const r = ceil(range / this.cellSize);
    const cx = floor(x / this.cellSize);
    const cy = floor(y / this.cellSize);

    const x0 = max(0, cx - r), x1 = min(this.cols - 1, cx + r);
    const y0 = max(0, cy - r), y1 = min(this.rows - 1, cy + r);

    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const cell = this.cells[gy * this.cols + gx];
        for (const it of cell) result.push(it);
      }
    }
    return result;
  }

  // debug: vykreslí mřížku
  render() {
    push();
    stroke(255, 255, 255, 16);
    strokeWeight(1);
    for (let gx = 1; gx < this.cols; gx++) {
      line(gx * this.cellSize, 0, gx * this.cellSize, height);
    }
    for (let gy = 1; gy < this.rows; gy++) {
      line(0, gy * this.cellSize, width, gy * this.cellSize);
    }
    pop();
  }
}

// -------------------------------------------------------------------------
//  Entity
// -------------------------------------------------------------------------
class Entity {
  constructor(x, y, faction) {
    this.faction = faction;
    this.color = lore.factions[faction].color;
    this.shape = lore.factions[faction].shape;

    this.position = createVector(x, y);
    // náhodný počáteční směr s rozumnou rychlostí
    this.velocity = p5.Vector.random2D().mult(random(1, CONFIG.maxSpeed));
    this.acceleration = createVector(0, 0);

    this.baseMaxSpeed = CONFIG.maxSpeed;   // základ; aktuální maxSpeed moduluje hunger
    this.maxSpeed = CONFIG.maxSpeed;
    this.maxForce = CONFIG.maxForce;

    // wander řízený Perlin noise (plynulé meandrování, ne náhodné cukání)
    this.noiseSeed = random(1000);

    // --- vnitřní stav (krok 5) ---
    this.alive = true;
    this.hunger = random(CONFIG.hunt.hungerStart[0], CONFIG.hunt.hungerStart[1]);
    this.role = 'PREY';            // dynamická, přepočítává se každý snímek
    this.huntTarget = null;        // aktuální cíl lovu (ofenziva; pro chování + debug)

    // --- energie a stamina ---
    this.energy = random(CONFIG.energy.start[0], CONFIG.energy.start[1]);  // rezerva síly
    this.stamina = random(CONFIG.stamina.start[0], CONFIG.stamina.start[1]); // sprint
    this.winded = false;           // zadýchaný (vyčerpaná stamina)
    this.sprinting = false;        // sprintuje právě teď?
    this.healing = false;          // přijímá právě teď energii od hejna?
    this.huntLock = 0;             // snímky závazku k cíli lovu (commitment)
    this.fleeVec = createVector(0, 0); // agregovaný směr od hrozeb (plynulý útěk)
    this.glow = 0;                 // vyhlazený jas (-1 tma .. +1 světlo), proti blikání
    this.healGlow = 0;             // vyhlazená intenzita healing prstence

    // --- povaha a strach (krok 6) ---
    this.character = random() < CONFIG.character.protectorRatio ? 'PROTECTOR' : 'ATTACKER';
    this.courage = random(CONFIG.courageStart[0], CONFIG.courageStart[1]); // neměnná
    this.strength = random(CONFIG.strengthStart[0], CONFIG.strengthStart[1]); // síla (viditelná, neměnná)
    this.fear = 0;                 // dynamický 0..1
    this.fleeing = false;          // utíká právě teď?
    this.wantFight = false;        // postoj „postavit se a bojovat" (drží se přes setrvačnost)
    this.rallying = false;         // postoj „jdu pomoct squadu do boje" (k těžišti nepřítele)
    this.decisionTimer = 0;        // setrvačnost postoje: > 0 = drž rozhodnutí, nepřehodnocuj
    this.fighting = false;         // právě kouše/je kousán (pro vizuál + exertion)
    this.localAllies = 0;          // počet vnímaných spojenců (síla v počtech, čtou i cizí)
    this.deterred = false;         // chtěl by lovit, ale odradila ho převaha kořisti
    this.nearestThreat = null;     // nejbližší hrozba (čtou ji i protectoři spojenců)
    this.squad = null;             // sdílená skupina (přepočítává se každý snímek v buildSquads)
    this.incomingAttackers = 0;    // kolik nepřátel mě má za huntTarget (přepočítává se před update)
    this.trappedFrames = 0;        // marný útěk (nedaří se zvětšit odstup) → spustí zoufalý boj
    this.lastThreatDist = Infinity;// odstup od hrozby v minulém snímku (detekce pasti)
    this.crowding = 0;             // počet namačkaných těl kolem (zpomaluje průchod davem)
    // osobní prostor + individuální sklon boj/útěk (mírný rozptyl, ať nejsou klony)
    this.spacing = random(CONFIG.boids.personalSpace[0], CONFIG.boids.personalSpace[1]);
    this.fightBias = random(-CONFIG.fear.fightBiasRange, CONFIG.fear.fightBiasRange);
    this.jukeTimer = floor(random(CONFIG.flee.jukeIntervalFrames[1])); // klička
    this.jukeDir = 1;              // strana zalomení (+1 / -1)
  }

  // sytost = plné břicho (ne časovač): nad satiationFull entita neshání nové cíle
  get satiated() { return this.energy >= CONFIG.hunt.satiationFull; }

  // ---- aplikace síly (akumuluje se do acceleration) ----
  applyForce(force) {
    this.acceleration.add(force);
  }

  // ---- najdi sousedy v okolí přes spatial grid ----
  //  vrací entity (kromě sebe) do vzdálenosti `range`
  findNeighbors(range) {
    const candidates = grid.query(this.position.x, this.position.y, range);
    const neighbors = [];
    const r2 = range * range;
    for (const other of candidates) {
      if (other === this) continue;
      const d2 = p5.Vector.sub(other.position, this.position).magSq();
      if (d2 <= r2) neighbors.push(other);
    }
    return neighbors;
  }

  // ---- Perception: koho entita skutečně vnímá ----
  //  vnímá entitu, pokud je:
  //   - uvnitř proxy poloměru (kolem dokola, "slyší dupání"), NEBO
  //   - uvnitř zorného kužele ve směru pohybu (visionRange + visionAngle).
  //  Vrací pole vnímaných entit (napříč frakcemi — rozlišení až v rozhodování).
  perceive() {
    const P = CONFIG.perception;
    const maxRange = max(P.visionRange, P.proxyRange);
    const candidates = grid.query(this.position.x, this.position.y, maxRange);

    const halfAngle = radians(P.visionAngle) / 2;
    const visR2 = P.visionRange * P.visionRange;
    const proxR2 = P.proxyRange * P.proxyRange;

    // směr pohledu = směr pohybu (když skoro stojí, kužel nemá smysl → jen proxy)
    const heading = this.velocity.copy();
    const hasHeading = heading.magSq() > 0.0001;

    const seen = [];
    for (const other of candidates) {
      if (other === this) continue;
      const toOther = p5.Vector.sub(other.position, this.position);
      const d2 = toOther.magSq();

      // 1) proxy spot — blízko, nezávisle na směru
      if (d2 <= proxR2) { seen.push(other); continue; }

      // 2) zorný kužel — v dosahu A v úhlu před entitou
      if (hasHeading && d2 <= visR2) {
        const ang = p5.Vector.angleBetween(heading, toOther);
        if (abs(ang) <= halfAngle) seen.push(other);
      }
    }
    return seen;
  }

  // ---- steering helper: zatoč směrem k požadované rychlosti ----
  //  desiredVel = cílový směr*maxSpeed; vrací sílu ořezanou na maxForce
  steerTowards(desiredVel) {
    const steer = p5.Vector.sub(desiredVel, this.velocity);
    steer.limit(this.maxForce);
    return steer;
  }

  // ---- Separation: odtlač se od velmi blízkých sousedů ----
  //  váha klesá se vzdáleností (1/d) — čím blíž soused, tím silnější odpor
  separation(neighbors) {
    const steer = createVector(0, 0);
    let count = 0;
    // OSOBNÍ PROSTOR: každá entita drží trochu jiný odstup (this.spacing)
    const range = CONFIG.boids.separationRange * this.spacing;
    const r2 = range * range;
    const engW = CONFIG.combat.engagedSeparation;
    for (const o of neighbors) {
      const diff = p5.Vector.sub(this.position, o.position);
      const d2 = diff.magSq();
      if (d2 > 0 && d2 < r2) {
        // u bojujícího spojence (nebo když sám bojuju) odpor ztlumíme → hejno se
        // smí nahrnout k frontě a zapojit do kotle (ne se držet uctivě opodál)
        const w = (this.fighting || o.fighting) ? engW : 1;
        diff.setMag(w / sqrt(d2));   // 1/d váhování (× ztlumení při souboji)
        steer.add(diff);
        count++;
      }
    }
    if (count === 0) return steer;
    steer.setMag(this.maxSpeed);
    return this.steerTowards(steer);
  }

  // ---- Alignment: srovnej směr se spojenci v dohledu ----
  alignment(neighbors) {
    const sum = createVector(0, 0);
    for (const o of neighbors) sum.add(o.velocity);
    if (neighbors.length === 0) return sum;
    sum.setMag(this.maxSpeed);
    return this.steerTowards(sum);
  }

  // ---- Cohesion: miř ke středu (těžišti) blízkých spojenců ----
  cohesion(neighbors) {
    const center = createVector(0, 0);
    for (const o of neighbors) center.add(o.position);
    if (neighbors.length === 0) return center;
    center.div(neighbors.length);
    const desired = p5.Vector.sub(center, this.position);
    desired.setMag(this.maxSpeed);
    return this.steerTowards(desired);
  }

  // ---- Pursue: miř na kořist s predikcí její budoucí pozice ----
  pursue(target) {
    const future = p5.Vector.add(
      target.position,
      p5.Vector.mult(target.velocity, CONFIG.hunt.predictFrames)
    );
    const desired = p5.Vector.sub(future, this.position);
    desired.setMag(this.maxSpeed);
    return this.steerTowards(desired);
  }

  // ---- ochota zaútočit na konkrétní kořist (deterrence / emboldenment) ----
  //  porovná moji podporu (1+spojenci) s ochranou kořisti (1+její spojenci).
  //  Potřebná převaha klesá s hladem (zoufalý riskuje) a u ATTACKERa.
  willingToAttack(f) {
    const D = CONFIG.deter;
    // SQUAD vs viditelný NEPŘÍTEL: za mnou stojí síla celé skupiny, proti mně
    // síla těch nepřátel, které skupina kolektivně vidí (mlha války → osamělá
    // skupina může přečíslenou osmičku podcenit a nechat se překvapit).
    const sq = this.squad;
    const myPower = sq ? sq.power : this.strength;
    // aspoň respektuj sílu samotného cíle (osamělý silák není snadná kořist)
    const foePower = max(sq ? sq.enemyPower : 0, f.strength * constrain(f.energy, 0.15, 1));
    const ratio = myPower / max(foePower, 0.0001);
    if (ratio >= CONFIG.squad.overwhelm) return true;   // drtivá převaha → commit (opatrnost stranou)
    let need = D.baseRatio - this.hunger * D.hungerBravado;
    if (this.character === 'ATTACKER') need -= D.attackerBravado;
    need = max(D.minNeed, need);
    return ratio >= need;
  }

  // ---- vyber kořist: nejbližší cizí, na kterou si troufnu zaútočit ----
  //  (izolovanou kořist nechá projít deterrence, kořist v sevřeném hejnu odradí)
  pickPrey(foes) {
    const cap = CONFIG.combat.maxAttackersPerTarget;
    let best = null, bestD2 = Infinity;
    for (const f of foes) {
      if (!f.alive) continue;
      if (f.incomingAttackers >= cap) continue;  // už ho obléhá dost útočníků → nech být (čekej na slot)
      if (!this.willingToAttack(f)) continue;     // odrazen převahou/silou kořisti
      const d2 = p5.Vector.sub(f.position, this.position).magSq();
      if (d2 < bestD2) { bestD2 = d2; best = f; }
    }
    return best;
  }

  // ---- Souboj: ukusování (oboustranné, kontaktní) ----
  //  Každý snímek entita zasadí JEDNO kousnutí: primárně svému lovenému cíli
  //  (ofenziva), jinak se brání a kousne nejbližšího nepřítele, který jde po ní.
  //  Protože útočník drží oběť jako huntTarget, oběť ho přes větev "obrana" kousne
  //  ZPĚT i když zrovna utíká. Z ukousnutého se vstřebá jen biteEfficiency, zbytek
  //  je režie a mizí → energie ze systému ubývá → duel vždy spěje k vítězi.
  doBite(foes) {
    this.fighting = false;
    const C = CONFIG.combat;
    const r2 = C.biteRange * C.biteRange;

    // 1) ofenziva: koušu vlastní cíl, je-li na dosah
    let victim = null;
    if (this.huntTarget && this.huntTarget.alive &&
        p5.Vector.sub(this.huntTarget.position, this.position).magSq() <= r2) {
      victim = this.huntTarget;
    }
    // 2) obrana: jinak kousnu nejbližšího nepřítele, který si MĚ vybral za cíl
    if (!victim) {
      let bd2 = r2;
      for (const f of foes) {
        if (!f.alive || f.huntTarget !== this) continue;
        const d2 = p5.Vector.sub(f.position, this.position).magSq();
        if (d2 <= bd2) { bd2 = d2; victim = f; }
      }
    }
    if (!victim) return;

    this.fighting = true;
    // tempo ukusování = síla × stamina (zadýchaný kouše slaběji → může prohrát duel)
    const rate = C.biteBase * this.strength * lerp(0.4, 1, this.stamina);
    const taken = min(rate, victim.energy);
    victim.energy -= taken;
    const ingested = taken * C.biteEfficiency;                  // nutriční hodnota (zbytek = režie, mizí)
    const room = CONFIG.energy.maxEnergy - this.energy;
    this.energy += min(ingested, max(0, room));                 // co se vejde do břicha (přebytek mizí)
    this.hunger = max(0, this.hunger - ingested * CONFIG.hunt.feedFactor); // jídlo TIŠÍ HLAD

    if (victim.energy <= 0) {
      victim.energy = 0;
      victim.alive = false;
      victim.deathCause = 'eaten';
      if (this.huntTarget === victim) this.huntTarget = null;
      factionStats[this.faction].kills++;
      if (random() < 0.4) {
        const hunter = lore.factions[this.faction].name;
        const prey = lore.factions[victim.faction].name;
        pushEvent(`${hunter} dorazil(a) ${prey}`, lore.factions[this.faction].color);
      }
    }
  }

  // ---- Skupinový healing: přijmi energii od zdravých spojenců ----
  //  každý spojenec s přebytkem nad komfortem odevzdá zlomek přebytku;
  //  příjemce se hojí jen do komfortu, dárci nikdy neklesnou pod komfort.
  receiveHealing(allies) {
    this.healing = false;
    const HE = CONFIG.heal;
    if (this.energy >= HE.comfortThreshold) return;   // nepotřebuje pomoc
    if (this.fleeing) return;                          // při útěku se neléčí
    if (this.fighting) return;                         // v kotli žádná transfuze — léčí se až PO odpojení

    let received = 0;
    for (const a of allies) {
      if (a.fleeing) continue;                         // utíkající spojenec nedává
      const surplus = a.energy - HE.comfortThreshold;
      if (surplus <= 0) continue;                      // pod komfortem nedává (sebezáchova)
      const give = surplus * HE.donorRate;             // čím větší přebytek, tím štědřejší
      a.energy -= give;
      received += give;
    }
    if (received > 0) {
      this.energy = min(HE.comfortThreshold, this.energy + received);
      this.healing = true;
    }
  }

  // ---- Seek: miř k bodu ----
  seekPoint(point) {
    const desired = p5.Vector.sub(point, this.position);
    desired.setMag(this.maxSpeed);
    return this.steerTowards(desired);
  }

  // ---- Flee podél agregovaného směru "pryč od všech hrozeb" (plynulé) ----
  fleeAlong(dir) {
    if (dir.magSq() < 1e-6) return createVector(0, 0);
    const desired = dir.copy().setMag(this.maxSpeed);
    return this.steerTowards(desired);
  }

  // ---- Juke: klička jako zajíc (občasné náhodné zalomení do strany) ----
  juke() {
    const [lo, hi] = CONFIG.flee.jukeIntervalFrames;
    if (this.jukeTimer <= 0) {
      this.jukeDir = random() < 0.5 ? -1 : 1;
      this.jukeTimer = floor(random(lo, hi));
    } else {
      this.jukeTimer--;
    }
    // boční vektor kolmý na směr letu
    const side = createVector(-this.velocity.y, this.velocity.x);
    if (side.magSq() < 0.0001) return createVector(0, 0);
    side.setMag(this.maxSpeed * this.jukeDir);
    return this.steerTowards(side).mult(CONFIG.flee.jukeStrength);
  }

  // ---- Protect: vmezeř se mezi ohroženého spojence a jeho hrozbu ----
  //  vrací steering sílu, nebo nulový vektor když není koho/proč bránit
  //  nebo když je risk příliš velký (protector se zachová sobecky).
  protect(allies, myBravery) {
    let ward = null, wardFear = CONFIG.protect.allyFearTrigger;
    for (const a of allies) {
      if (a.fear > wardFear && a.nearestThreat && a.nearestThreat.alive) {
        wardFear = a.fear; ward = a;
      }
    }
    if (!ward) return createVector(0, 0);

    // posouzení rizika: jak hrozivá je hrozba vs. moje odvaha
    const threat = ward.nearestThreat;
    const menace = threat.hunger + (threat.role === 'PREDATOR' ? CONFIG.fear.predatorMenace : 0);
    if (menace > myBravery + CONFIG.protect.riskMargin) {
      return createVector(0, 0);   // moc velký risk → pomoc odmítne (sobecky)
    }

    // bod mezi spojencem a hrozbou (blíž ke straně hrozby dle interposeBias)
    const point = p5.Vector.lerp(ward.position, threat.position, CONFIG.protect.interposeBias);
    return this.seekPoint(point);
  }

  // ---- Wander: plynulý meandr přes Perlin noise (žádné cukání) ----
  wander() {
    // úhel odchylky se mění plynule podle noise (ne náhodným skokem každý snímek)
    const n = noise(this.noiseSeed + frameCount * CONFIG.wander.noiseSpeed);
    const wanderAngle = map(n, 0, 1, -PI, PI);

    // střed kruhu je před entitou ve směru pohybu
    const heading = this.velocity.copy();
    if (heading.magSq() < 0.0001) heading.set(1, 0);
    heading.setMag(CONFIG.wander.circleDist);

    const offset = p5.Vector.fromAngle(wanderAngle).mult(CONFIG.wander.circleRadius);
    const target = p5.Vector.add(heading, offset);   // relativní k entitě

    target.setMag(this.maxSpeed);
    return this.steerTowards(target);
  }

  // ---- Okraje: čím blíž k hranici arény, tím silnější tlak dovnitř ----
  edges() {
    const m = CONFIG.edge.margin;
    const desired = createVector(0, 0);

    if (this.position.x < arena.x0 + m)      desired.x = this.maxSpeed;
    else if (this.position.x > arena.x1 - m) desired.x = -this.maxSpeed;

    if (this.position.y < arena.y0 + m)      desired.y = this.maxSpeed;
    else if (this.position.y > arena.y1 - m) desired.y = -this.maxSpeed;

    if (desired.magSq() === 0) return createVector(0, 0);

    desired.setMag(this.maxSpeed);
    return this.steerTowards(desired);
  }

  // ---- jeden krok simulace ----
  update() {
    // mrtvá entita (např. ukousnutá jiným útočníkem ve stejném snímku) už nic nedělá
    if (!this.alive) return;

    // Jeden krok simulace = lineární pipeline „vnímej → rozhodni se → jednej":
    //   1) hlad v čase
    //   2) vnímání → rozdělení na spojence / cizí
    //   3) vyhodnocení hrozeb (threatSum, fleeVec, nejbližší hrozba)
    //   4) strach (roste s hrozbou, jinak klesá)
    //   5) rozhodnutí: klid / útěk / postavit se a bojovat
    //   6) lov (ofenziva): výběr a držení kořisti (lock, deterrence, maxAttackers)
    //   6b) souboj: oboustranné ukusování (doBite)
    //   7) skupinový healing (jen mimo souboj)
    //   8) energie / stamina / souboj / tlačenice → výsledná rychlost (zde i smrt)
    //   9) steering: boids + flee / hunt / fight / protect
    //  10) wander, okraje, integrace (setrvačnost) → posun pozice
    const H = CONFIG.hunt;

    // 1) hlad v čase (rychlost se počítá až po rozhodnutí, viz krok 8)
    this.hunger = min(1, this.hunger + H.hungerRate);

    // 2) koho entita vnímá (zorný kužel + proxy), rozděleno na spojence / cizí
    const perceived = this.perceive();
    const allies = [];
    const foes = [];
    for (const o of perceived) {
      if (!o.alive) continue;
      if (o.faction === this.faction) allies.push(o);
      else foes.push(o);
    }
    this.localAllies = allies.length;     // moje síla v počtech (čtou i cizí entity)

    const mods = CONFIG.charMods[this.character];
    const D = CONFIG.deter;
    // síla MOJÍ skupiny vs síla viditelného nepřítele (sdílené přes squad).
    const myPower = this.squad ? this.squad.power : this.strength;
    const enemyPower = this.squad ? this.squad.enemyPower : 0;
    // jak moc nás silově přečíslují → škáluje hrozivost (squad remíza = klid,
    // přesila soupeře = strach, naše přesila = odvaha a commit)
    const powerFactor = constrain(enemyPower / max(myPower, 0.0001), D.numMin, D.numMax);

    // 3) hrozby mezi vnímanými cizími: hrozivost = potenciální (hlad, ŠKÁLOVANÁ
    //    početní převahou) + bezprostřední (cizí právě loví / jde po MNĚ — čísly
    //    NEškálováno, aby vtržení predátora do hejna i tak vyděsilo okolí).
    const F = CONFIG.fear;
    let threatSum = 0;
    this.nearestThreat = null;
    let bestMenace = F.threatGate;
    this.fleeVec.set(0, 0);   // agregovaný směr "pryč od hrozeb" (plynulý útěk)
    for (const f of foes) {
      const d = p5.Vector.dist(this.position, f.position);
      const prox = constrain(1 - d / CONFIG.perception.visionRange, 0, 1);

      // hrozivost: pasivní (cizí v dosahu + mírně jeho hlad) × silová převaha;
      //   to hlavní (predator/jde-po-mně) se přičítá níž a hladem se NEškáluje
      let menace = (F.baseThreat + f.hunger * F.hungerThreat) * powerFactor;
      if (f.role === 'PREDATOR') menace += F.predatorMenace;  // bezprostřední: aktivně loví
      if (f.huntTarget === this) menace += F.targetedBonus;   // bezprostřední: jde po mně

      const weighted = menace * prox;
      threatSum += weighted;

      // útěk od TĚŽIŠTĚ hrozeb: přičti směr od cizího, vážený hrozivostí
      if (d > 0.0001) {
        this.fleeVec.x += (this.position.x - f.position.x) / d * weighted;
        this.fleeVec.y += (this.position.y - f.position.y) / d * weighted;
      }
      // nejbližší/nejhorší hrozba (pro panic-sprint a debug)
      if (weighted > bestMenace) { bestMenace = weighted; this.nearestThreat = f; }
    }
    threatSum = min(threatSum, 1.5);

    // 4) strach: roste s hrozbou, jinak klesá (v bezpečí rychleji)
    if (threatSum > 0) {
      this.fear = min(1, this.fear + threatSum * F.riseRate);
    } else {
      const dec = F.decay + (allies.length > 0 ? F.safeDecayBonus : 0);
      this.fear = max(0, this.fear - dec);
    }

    // odvaha = povaha + CELÝ squad (i zadák ví, že je nás hodně) + HLAD (desperation:
    //   hladový riskuje až běsní). Díky hladu se konec scény mění ve frenzy, ne ve strnulost.
    const sqSize = this.squad ? this.squad.size : 1;
    const bravery = this.courage +
      min((sqSize - 1) * F.allyBravery, F.allyBraveryMax) +
      this.hunger * F.hungerBravery;

    // 5) + 6) ROZHODNUTÍ se SETRVAČNOSTÍ. Postoj (klid / útěk / boj / lov) se
    //    NEpřepočítává od nuly každý snímek — drží se `decisionTimer` snímků a
    //    přehodnotí se až po jeho vypršení, NEBO když nastane tvrdé přerušení
    //    (cíl zmizel, hrozba zmizela, panika, zahnání do kouta). Tím zmizí blikání
    //    rozhodnutí kvůli šumu ve vstupech (kolísání síly squadu apod.).
    const effHuntThreshold = H.huntThreshold + mods.huntThresholdAdd;

    // 5a) měření pasti (běží KAŽDÝ snímek, nezávisle na setrvačnosti)
    const threatDist = this.nearestThreat
      ? p5.Vector.dist(this.position, this.nearestThreat.position) : Infinity;
    if (this.fleeing && this.nearestThreat && threatDist < CONFIG.perception.visionRange) {
      if (threatDist <= this.lastThreatDist + 0.5) this.trappedFrames++;   // odstup neroste → past
      else this.trappedFrames = max(0, this.trappedFrames - 2);            // unikám → reset
    } else {
      this.trappedFrames = 0;
    }
    this.lastThreatDist = threatDist;
    const trapped = this.trappedFrames >= F.trappedFrames;

    // 5b) údržba cíle lovu KAŽDÝ snímek: obnova locku + TVRDÉ puštění (smrt/daleko/lock)
    let huntInvalid = false;
    if (this.huntTarget) {
      const t = this.huntTarget;
      if (foes.includes(t)) this.huntLock = H.lockFrames; else this.huntLock--;
      const tooFar = p5.Vector.sub(t.position, this.position).magSq() > H.maxChase * H.maxChase;
      if (!t.alive || tooFar || this.huntLock <= 0) { this.huntTarget = null; huntInvalid = true; }
    }

    // 5c) přehodnotit postoj? (vypršela setrvačnost NEBO tvrdé přerušení)
    const reDecide =
      this.decisionTimer <= 0 ||
      huntInvalid ||                                                 // ztratil cíl
      (!this.nearestThreat && (this.fleeing || this.wantFight)) ||   // hrozba zmizela
      (this.fear >= F.breakOffFear && !this.fleeing) ||              // panika → smí přepnout na útěk
      (trapped && !this.wantFight);                                  // past → smí přepnout na boj

    if (reDecide) {
      // útěk vs. postavit se a bojovat (strach vs. odvaha + sklon / zoufalství)
      const fleeThreshold = this.fleeing ? bravery - F.fleeHysteresis : bravery;
      const underPressure = !!this.nearestThreat && this.fear > fleeThreshold;
      let wantFight = underPressure &&
        ((bravery + this.fightBias) >= F.fightCourage || trapped);
      if (wantFight && this.fear >= F.breakOffFear && !trapped) wantFight = false; // prohrávám → prchni
      this.wantFight = wantFight;
      this.fleeing = underPressure && !wantFight;

      // LOV (ofenziva): deterrence/rescue se vyhodnocuje PRÁVĚ TADY (ne každý snímek)
      //   — pustí cíl, když kořisti přiběhla pomoc. Nasycenost blokuje jen NOVÉ cíle;
      //   rozkousaný cíl entita dorazí i sytá (přebytek propadne jako režie).
      const wantsToHunt = !this.fleeing && !this.satiated && this.hunger >= effHuntThreshold;
      if (this.fleeing) {
        this.huntTarget = null;                                      // útěk ruší ofenzivu
      } else if (this.huntTarget && !this.willingToAttack(this.huntTarget)) {
        this.huntTarget = null;                                      // odrazen (přepočet převahy/síly)
      }
      if (wantsToHunt && !this.huntTarget) {
        this.huntTarget = this.pickPrey(foes);
        if (this.huntTarget) {
          this.huntLock = H.lockFrames;
          const td2 = p5.Vector.sub(this.huntTarget.position, this.position).magSq();
          if (td2 <= CONFIG.combat.slotRange * CONFIG.combat.slotRange) this.huntTarget.incomingAttackers++;
        }
      }
      this.deterred = wantsToHunt && !this.huntTarget && foes.length > 0;

      // RALLY (Vrstva B): nemám vlastní cíl ani osobní hrozbu, ale squad KOLEKTIVNĚ
      //   vidí nepřítele → přidej se do boje (k jeho těžišti) podle ochoty helpDesire.
      this.rallying = false;
      const sq = this.squad;
      if (!this.fleeing && !this.wantFight && !this.huntTarget && sq && sq.hasEnemy) {
        const RA = CONFIG.rally;
        const adv = sq.power / max(sq.enemyPower, 0.0001);
        let desire = mods.rally + this.courage * RA.courageW - this.fear * RA.fearW
                   + (adv - 1) * RA.advW;                         // silní se hrnou, slabí necharí do prohry
        const tired = this.energy < RA.tiredHold || this.stamina < RA.tiredHold;
        if (tired && adv >= RA.desperation) desire -= 0.5;        // hájený: drž se v 2. linii…
        const d2 = (this.position.x - sq.enemyCx) ** 2 + (this.position.y - sq.enemyCy) ** 2;
        this.rallying = d2 <= RA.maxRange * RA.maxRange && desire >= RA.threshold;  // …dokud neprohráváme
      }

      this.decisionTimer = CONFIG.decision.holdFrames + floor(random(CONFIG.decision.jitter));
    } else {
      this.decisionTimer--;                                          // drž postoj dál
    }
    this.role = this.huntTarget ? 'PREDATOR' : 'PREY';

    // 6b) SOUBOJ: oboustranné ukusování. Útočník kouše svůj cíl; oběť (i bránící se,
    //     i prchající) kouše zpět toho, kdo si ji vybral. Nastaví this.fighting.
    this.doBite(foes);

    // 7) skupinový healing: zraněný přijme energii od zdravých spojenců (mimo souboj;
    //     před výpočtem smrti — hejno tě může vytáhnout z nuly)
    this.receiveHealing(allies);

    // 8) energie, stamina a výsledná rychlost
    //   - sprint chce predátor až nablízko ke kořisti (engage), kořist až když
    //     je hrozba blízko (panic) — jinak se "šetří" cruisem.
    //   - sprint vybíjí staminu i energii; vyčerpaná stamina => zadýchání (winded).
    const ST = CONFIG.stamina, EN = CONFIG.energy;

    //   hystereze dosahu: kdo už sprintuje, drží sprint do 1.3× dosahu (proti blikání)
    const hyst = this.sprinting ? ST.rangeHysteresis : 1;
    let wantSprint = false;
    if (this.huntTarget) {
      wantSprint = p5.Vector.dist(this.position, this.huntTarget.position) < ST.engageRange * hyst;
    } else if (this.fleeing && this.nearestThreat) {
      wantSprint = p5.Vector.dist(this.position, this.nearestThreat.position) < ST.panicRange * hyst;
    }
    const sprinting = wantSprint && this.stamina > 0 && !this.winded;
    this.sprinting = sprinting;

    // stamina: vybíjení při sprintu (→ zadýchání), jinak regenerace
    if (sprinting) {
      this.stamina = max(0, this.stamina - ST.drain);
      if (this.stamina <= 0) this.winded = true;
    } else {
      this.stamina = min(1, this.stamina + ST.regen);
      if (this.winded && this.stamina >= ST.recoverThreshold) this.winded = false;
    }
    // souboj navíc vysiluje staminu (zadýchaný kouše slaběji → může duel prohrát)
    if (this.fighting) {
      this.stamina = max(0, this.stamina - CONFIG.combat.exertionStamina);
      if (this.stamina <= 0) this.winded = true;
    }

    // energie: metabolismus (+ sprint navíc + souboj navíc); při 0 entita umírá
    // (proto i vítěz vyčerpaného souboje může vzápětí padnout hlady)
    this.energy -= EN.metabolism + (sprinting ? EN.sprintDrain : 0)
                                 + (this.fighting ? CONFIG.combat.exertionEnergy : 0);
    if (this.energy <= 0) { this.energy = 0; this.alive = false; this.deathCause = 'starved'; return; }

    // cruise rychlost dle energie (přebytek nad 1.0 je jen rezerva, ne rychlost)
    let cruise = this.baseMaxSpeed * lerp(EN.minCruise, 1, min(1, this.energy));
    if (this.satiated) cruise *= H.satiatedSpeedFactor;
    if (sprinting)        this.maxSpeed = cruise * ST.sprintMult;
    else if (this.winded) this.maxSpeed = cruise * ST.windedFactor;
    else                  this.maxSpeed = cruise;

    // TLAČENICE: protahování mezi namačkanými těly bere rychlost (davem se jde pomalu)
    const CR = CONFIG.crowd;
    this.crowding = this.findNeighbors(CR.radius).length;
    this.maxSpeed *= lerp(1, CR.minFactor, min(1, this.crowding / CR.full));

    // 9) klasické boids síly v rámci frakce
    //    (kohéze: PROTECTOR drží hejno víc, ATTACKER míň; lov ji ztlumí;
    //     zraněný k hejnu silněji lne — hledá pomoc/healing)
    let cohW = CONFIG.boids.cohesionWeight * mods.cohesion;
    if (this.huntTarget) cohW *= H.huntCohesionFactor;
    else if (this.energy < CONFIG.heal.seekThreshold) cohW *= CONFIG.heal.seekBoost;
    this.applyForce(this.separation(allies).mult(CONFIG.boids.separationWeight));
    this.applyForce(this.alignment(allies).mult(CONFIG.boids.alignmentWeight));
    this.applyForce(this.cohesion(allies).mult(cohW));

    if (this.fleeing) {
      // --- ÚTĚK ---  od TĚŽIŠTĚ hrozeb (plynulý směr), síla roste se strachem
      const fleeW = CONFIG.flee.weight * this.fear;
      this.applyForce(this.fleeAlong(this.fleeVec).mult(fleeW));
      if (allies.length > 0) {
        // strategie 1: útěk ke spojencům (ochrana hejna)
        const center = createVector(0, 0);
        for (const a of allies) center.add(a.position);
        center.div(allies.length);
        this.applyForce(this.seekPoint(center).mult(CONFIG.flee.toAlliesWeight));
      } else {
        // strategie 2: slepý útěk + klička jako zajíc
        // (strategie 3 "smůla" = přirozený důsledek, neošetřujeme)
        this.applyForce(this.juke());
      }
    } else if (this.huntTarget) {
      // --- LOV --- miř na kořist (predikce); ukousnutí řeší doBite (krok 6b)
      this.applyForce(this.pursue(this.huntTarget).mult(H.pursueWeight * mods.pursue));
    } else if (this.wantFight && this.nearestThreat && this.nearestThreat.alive) {
      // --- POSTAVIT SE A BOJOVAT --- otoč se čelem k hrozbě a zaklesni se s ní
      //     (kousat se bude samo přes doBite, až bude na dosah; obrana = kousnutí zpět)
      this.applyForce(this.seekPoint(this.nearestThreat.position).mult(H.pursueWeight * mods.pursue));
    } else if (this.rallying && this.squad && this.squad.hasEnemy) {
      // --- RALLY --- přidej se ke skupinovému boji: vyraz k těžišti nepřítele,
      //     které squad kolektivně vidí (i když ho sám zatím nevidím). Příchody
      //     z více směrů → obkličování, do boje se zapojí i zadáci.
      this.applyForce(this.seekPoint(createVector(this.squad.enemyCx, this.squad.enemyCy))
        .mult(CONFIG.rally.weight));
    } else if (this.character === 'PROTECTOR') {
      // --- OCHRANA --- vmezeř se mezi ohroženého spojence a hrozbu
      this.applyForce(
        this.protect(allies, bravery).mult(CONFIG.protect.weight * mods.protect)
      );
    }

    // 10) wander se ztlumí, když má entita kolem sebe spojence (drží hejno),
    //    a při útěku/lovu/boji ho potlačíme úplně (entita má jasný cíl)
    let wanderWeight = allies.length > 0
      ? CONFIG.wanderFlockWeight
      : CONFIG.wanderLoneWeight;
    if (this.fleeing || this.huntTarget || this.wantFight || this.rallying) wanderWeight = 0;
    this.applyForce(this.wander().mult(wanderWeight));

    this.applyForce(this.edges().mult(CONFIG.edge.weight));

    // kandidát na novou rychlost (síly → akcelerace), ořezaný na maxSpeed
    const cand = p5.Vector.add(this.velocity, this.acceleration);
    cand.limit(this.maxSpeed);

    // cílová rychlost (podél dráhy se mění volně), s minimem ať se nezastaví
    const minSpeed = this.maxSpeed * CONFIG.minSpeedFactor;
    let candSpeed = max(cand.mag(), minSpeed);

    // SETRVAČNOST: směr se smí natočit jen o omezený úhel za snímek; limit
    // klesá s aktuální rychlostí (rychlý = široké oblouky, pomalý = ostré kličky)
    const T = CONFIG.turn;
    const curSpeed = this.velocity.mag();
    if (curSpeed > 1e-4 && cand.magSq() > 1e-8) {
      const maxTurn = constrain(T.baseRate * T.speedRef / curSpeed, T.minRate, T.maxRate);
      const a0 = this.velocity.heading();
      let diff = cand.heading() - a0;
      while (diff > PI) diff -= TWO_PI;     // normalizace do [-PI, PI]
      while (diff < -PI) diff += TWO_PI;
      diff = constrain(diff, -maxTurn, maxTurn);
      this.velocity = p5.Vector.fromAngle(a0 + diff).mult(candSpeed);
    } else {
      this.velocity = cand.setMag(candSpeed);
    }

    this.position.add(this.velocity);
    this.acceleration.mult(0);

    // tvrdá pojistka, kdyby entita přesto vyletěla z plátna
    this.position.x = constrain(this.position.x, 0, width);
    this.position.y = constrain(this.position.y, 0, height);
  }

  // ---- vykreslení: trojúhelník orientovaný po směru pohybu ----
  render() {
    const angle = this.velocity.heading();
    // velikost dle energie: silný/najedený = větší, vyhladovělý = menší (zhublý)
    const s = CONFIG.entitySize * (0.7 + this.energy * 0.5);

    // Cílový jas (glow): + = světlejší (nasycení/sprint), − = tmavší (strach/zadýchání).
    // Vyhlazujeme přes this.glow (lerp), aby jas neblikal při rychlém přepínání stavů.
    let targetGlow = 0;
    if (this.satiated)        targetGlow = 0.45;
    else if (this.sprinting)  targetGlow = 0.30;
    else if (this.fear > 0.05) targetGlow = -this.fear * 0.45;
    if (this.winded) targetGlow = min(targetGlow, -0.40);
    this.glow += (targetGlow - this.glow) * 0.12;

    let r = this.color[0], g = this.color[1], b = this.color[2];
    if (this.glow > 0) {
      r = lerp(r, 255, this.glow); g = lerp(g, 255, this.glow); b = lerp(b, 255, this.glow);
    } else if (this.glow < 0) {
      const k = 1 + this.glow;   // glow ∈ (−0.45..0) → k ∈ (0.55..1)
      r *= k; g *= k; b *= k;
    }

    push();
    translate(this.position.x, this.position.y);
    rotate(angle);

    // souboj = červený obrys (kouše/je kousán); jinak predátor s cílem = světlý obrys
    if (this.fighting) {
      stroke(255, 90, 60, 230);
      strokeWeight(1.8);
    } else if (this.role === 'PREDATOR') {
      stroke(255, 255, 255, 200);
      strokeWeight(1.5);
    } else {
      noStroke();
    }
    fill(r, g, b);
    // tvar frakce, špička míří doprava (+x); heading() = 0 míří doprava
    beginShape();
    for (const p of SHAPES[this.shape]) vertex(p[0] * s, p[1] * s);
    endShape(CLOSE);
    pop();

    // healing: jemný zelený prstenec (vyhlazená intenzita, ať nebliká)
    this.healGlow += ((this.healing ? 1 : 0) - this.healGlow) * 0.1;
    if (this.healGlow > 0.03) {
      push();
      noFill();
      stroke(120, 255, 160, 150 * this.healGlow);
      strokeWeight(1.5);
      circle(this.position.x, this.position.y, s * 3.2);
      pop();
    }

    if (debug) this.renderDebug();
  }

  renderDebug() {
    const P = CONFIG.perception;
    const heading = this.velocity.heading();

    push();
    translate(this.position.x, this.position.y);

    // zorný kužel (výseč ve směru pohybu)
    const half = radians(P.visionAngle) / 2;
    fill(this.color[0], this.color[1], this.color[2], 18);
    noStroke();
    arc(0, 0, P.visionRange * 2, P.visionRange * 2,
        heading - half, heading + half, PIE);

    // proxy spot (sluch — kolem dokola)
    noFill();
    stroke(255, 255, 255, 40);
    strokeWeight(1);
    circle(0, 0, P.proxyRange * 2);
    pop();

    // vektor rychlosti
    push();
    stroke(this.color[0], this.color[1], this.color[2], 150);
    strokeWeight(1);
    const v = p5.Vector.mult(this.velocity, 8);
    line(this.position.x, this.position.y,
         this.position.x + v.x, this.position.y + v.y);

    // čára k cíli lovu (predátor → kořist)
    if (this.huntTarget && this.huntTarget.alive) {
      stroke(255, 70, 70, 200);
      strokeWeight(1.5);
      line(this.position.x, this.position.y,
           this.huntTarget.position.x, this.huntTarget.position.y);
    }
    // čára útěku (kořist → od hrozby), žlutá
    if (this.fleeing && this.nearestThreat) {
      stroke(255, 220, 60, 200);
      strokeWeight(1.5);
      line(this.position.x, this.position.y,
           this.nearestThreat.position.x, this.nearestThreat.position.y);
    }
    // čára rally (→ k těžišti nepřítele squadu), světle modrá
    if (this.rallying && this.squad && this.squad.hasEnemy) {
      stroke(120, 200, 255, 180);
      strokeWeight(1.2);
      line(this.position.x, this.position.y, this.squad.enemyCx, this.squad.enemyCy);
    }
    pop();

    // značka charakteru: PROTECTOR = kroužek, ATTACKER = křížek
    push();
    translate(this.position.x, this.position.y);
    strokeWeight(1);
    if (this.character === 'PROTECTOR') {
      noFill();
      stroke(120, 200, 255, 180);
      circle(0, 0, CONFIG.entitySize * 2.4);
    } else {
      stroke(255, 160, 120, 180);
      const d = CONFIG.entitySize * 0.9;
      line(-d, -d, d, d);
      line(-d, d, d, -d);
    }
    pop();
  }
}

// -------------------------------------------------------------------------
//  Scéna: lore (svět + frakce), spawn ve více zónách, životní cyklus
// -------------------------------------------------------------------------
// Vygeneruj "příběh" scény: náhodná sada, svět, 2–4 frakce (název, barva,
//  tvar, populace). Populace se rozdělí rovnoměrně mezi frakce.
function generateLore() {
  const set = random(NAME_SETS);
  const world = random(set.worlds);
  const [lo, hi] = CONFIG.factionsRange;
  const nF = floor(random(lo, hi + 1));

  const names = shuffle([...set.factions], true).slice(0, nF);
  const colors = shuffle([...CONFIG.palette], true).slice(0, nF);
  const shapeIdx = shuffle([...Array(SHAPES.length).keys()], true);

  const base = floor(CONFIG.count / nF);
  const remainder = CONFIG.count - base * nF;
  const factions = [];
  for (let i = 0; i < nF; i++) {
    factions.push({
      name: names[i],
      color: colors[i],
      shape: shapeIdx[i % shapeIdx.length],
      count: base + (i < remainder ? 1 : 0),
    });
  }
  lore = { theme: set.theme, world, factions };
}

// Vytvoř procedurální planetu do intra. Jednou za scénu vygenerujeme texturu
//  (equirektangulární mapa moří/pevnin/ledu + mraky) a předpočítáme geometrii
//  koule + osvětlení. Za běhu se pak jen levně "roluje" textura (rotace).
function makePlanet() {
  const R = round(constrain(min(width, height) * 0.14, 90, 160));
  const texW = 384, texH = 192;   // vyšší rozlišení → ostřejší pobřeží/detail

  // archetyp světa + posun celé palety (odstín/sytost/jas) → velká pestrost
  const T = random(PLANET_TYPES);
  const dh = random(-26, 26), ds = random(0.8, 1.2), dv = random(0.88, 1.14);
  const J = (col) => {
    const [h, s, v] = rgb2hsv(col[0], col[1], col[2]);
    return hsv2rgb(h + dh, constrain(s * ds, 0, 1), constrain(v * dv, 0, 1));
  };
  const deepSea = J(T.deep), shoalSea = J(T.shoal), beach = J(T.beach);
  const low = J(T.low), high = J(T.high), rock = J(T.rock), peak = J(T.peak), iceCol = J(T.ice);
  const cloudCol = [245, 248, 255];
  const atm = [lerp(shoalSea[0], 150, 0.5), lerp(shoalSea[1], 180, 0.5), lerp(shoalSea[2], 255, 0.5)];

  const landThreshold = random(T.sea[0], T.sea[1]);   // poměr souš/voda dle typu
  const cloudThreshold = random(T.cloudT[0], T.cloudT[1]);
  const cloudStrength = random(T.cloudAmt[0], T.cloudAmt[1]);
  const surfScale = random(2.0, 3.2), cloudScale = random(2.6, 4.2);
  const warpAmt = random(0.25, 0.6);                  // domain warp → členitější pobřeží
  const polar = random(T.polar[0], T.polar[1]);
  const noff = random(1000), coff = random(1000), moff = random(1000), woff = random(1000);
  const spin = random(0.12, 0.4) * (random() < 0.5 ? -1 : 1);
  const cloudSpin = spin * random(1.4, 2.2);
  const tilt = random(-0.45, 0.45);
  const ambient = 0.10;

  // fBm: součet oktáv šumu → členité pobřeží a detail (ne "rozlitá barva")
  const fbm = (x, y, z, oct) => {
    let a = 0.5, f = 1, s = 0, nrm = 0;
    for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f, z * f); nrm += a; a *= 0.5; f *= 2; }
    return s / nrm;
  };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // 1) výškové (H) a vlhkostní (M) pole — vzorkování šumu na 3D KOULI, aby byly
  //    kontinenty izotropní (kulaté, rozházené jako na Zemi), ne svislé pruhy.
  const Hf = new Float32Array(texW * texH);
  const Mf = new Float32Array(texW * texH);
  for (let j = 0; j < texH; j++) {
    const lat = map(j, 0, texH - 1, HALF_PI, -HALF_PI);
    const clat = cos(lat), slat = sin(lat);
    for (let i = 0; i < texW; i++) {
      const lon = map(i, 0, texW - 1, -PI, PI);
      const ux = clat * cos(lon), uy = clat * sin(lon), uz = slat;   // bod na jednotkové kouli
      // domain warp v 3D → zvlněná, realistická pobřeží
      const wx = (fbm(woff + 1.6 * ux, woff + 1.6 * uy, woff + 1.6 * uz, 3) - 0.5) * warpAmt;
      const wy = (fbm(woff + 11 + 1.6 * ux, woff + 11 + 1.6 * uy, woff + 11 + 1.6 * uz, 3) - 0.5) * warpAmt;
      const wz = (fbm(woff + 23 + 1.6 * ux, woff + 23 + 1.6 * uy, woff + 23 + 1.6 * uz, 3) - 0.5) * warpAmt;
      Hf[j * texW + i] = fbm(noff + surfScale * ux + wx, noff + surfScale * uy + wy, noff + surfScale * uz + wz, 6);
      Mf[j * texW + i] = fbm(moff + 1.8 * ux, moff + 1.8 * uy, moff + 1.8 * uz, 3);
    }
  }

  // 2) barvení (výškové pásy + biomy) a reliéfní stínování
  const surf = new Uint8Array(texW * texH * 3);
  const cloud = new Uint8Array(texW * texH);
  for (let j = 0; j < texH; j++) {
    const lat = map(j, 0, texH - 1, HALF_PI, -HALF_PI);
    const latN = abs(lat) / HALF_PI;
    for (let i = 0; i < texW; i++) {
      const id = j * texW + i;
      const e = Hf[id], m = Mf[id];
      let c;
      if (e < landThreshold) {
        const depth = constrain((landThreshold - e) / landThreshold, 0, 1);
        c = mix3(shoalSea, deepSea, depth * depth);          // mělčina → hloubka (rychlejší ztmavnutí)
      } else {
        const h = (e - landThreshold) / (1 - landThreshold); // 0..1 nadmořská výška
        if (h < 0.05) c = mix3(beach, low, h / 0.05);        // pobřeží
        else if (h < 0.5) c = mix3(low, high, constrain(m * 1.4 - 0.2, 0, 1)); // suchá nížina↔les
        else if (h < 0.78) c = mix3(high, rock, (h - 0.5) / 0.28);
        else c = mix3(rock, peak, (h - 0.78) / 0.22);        // sněžné vrcholy

        // chladné vysoké šířky → sníh
        if (latN > 0.6) c = mix3(c, peak, constrain((latN - 0.6) / 0.32, 0, 1) * 0.5);

        // hillshade z gradientu výšky (slunce zleva nahoře) — dává reliéf
        const il = (i - 1 + texW) % texW, ir = (i + 1) % texW;
        const ju = max(0, j - 1), jd = min(texH - 1, j + 1);
        const gx = Hf[j * texW + ir] - Hf[j * texW + il];
        const gy = Hf[jd * texW + i] - Hf[ju * texW + i];
        const sh = constrain(1 + (-gx - gy) * 3.5, 0.7, 1.3);
        c = [c[0] * sh, c[1] * sh, c[2] * sh];
      }
      // polární led (na moři i souši)
      if (latN > polar) {
        const iceF = constrain(map(latN, polar, 1, 0, 1) * (0.55 + 0.45 * m), 0, 1);
        c = mix3(c, iceCol, iceF);
      }
      const o = id * 3;
      surf[o] = constrain(c[0], 0, 255); surf[o + 1] = constrain(c[1], 0, 255); surf[o + 2] = constrain(c[2], 0, 255);

      // mraky (fBm na 3D kouli)
      const lon = map(i, 0, texW - 1, -PI, PI);
      const clat = cos(lat), ux = clat * cos(lon), uy = clat * sin(lon), uz = sin(lat);
      const cn = fbm(coff + cloudScale * ux, coff + cloudScale * uy, coff + cloudScale * uz, 4);
      cloud[id] = cn > cloudThreshold ? floor(map(cn, cloudThreshold, 1, 0, 255)) : 0;
    }
  }

  // obrázek povrchu (použije se i jako tlumené pozadí hrací plochy)
  const bg = createImage(texW, texH);
  bg.loadPixels();
  for (let t = 0; t < texW * texH; t++) {
    const o = t * 3, q = t * 4;
    bg.pixels[q] = surf[o]; bg.pixels[q + 1] = surf[o + 1];
    bg.pixels[q + 2] = surf[o + 2]; bg.pixels[q + 3] = 255;
  }
  bg.updatePixels();

  // offscreen buffer (recyklujeme, pokud sedí velikost)
  const D = 2 * R;
  if (!planetBuffer || planetBuffer.width !== D) {
    planetBuffer = createGraphics(D, D);
    planetBuffer.pixelDensity(1);
  }
  planetBuffer.clear();

  // geometrie disku → koule + osvětlení (jednou)
  let Lx = -0.55, Ly = -0.5, Lz = 0.66;
  const Ll = sqrt(Lx * Lx + Ly * Ly + Lz * Lz); Lx /= Ll; Ly /= Ll; Lz /= Ll;
  const cosT = cos(tilt), sinT = sin(tilt);
  const idx = [], txf = [], rowBase = [], light = [], rim = [];
  for (let py = 0; py < D; py++) {
    const ny = (py - R + 0.5) / R;
    for (let pxi = 0; pxi < D; pxi++) {
      const nx = (pxi - R + 0.5) / R;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = sqrt(1 - r2);
      const yt = ny * cosT - nz * sinT;     // rotace o -tilt kolem X → planet-space
      const zt = ny * sinT + nz * cosT;
      const lat = asin(constrain(yt, -1, 1));
      const lon0 = atan2(nx, zt);
      idx.push((py * D + pxi) * 4);
      txf.push((lon0 + PI) / TWO_PI);
      let row = floor(map(lat, HALF_PI, -HALF_PI, 0, texH - 1));
      rowBase.push(constrain(row, 0, texH - 1) * texW);
      light.push(constrain(nx * Lx + ny * Ly + nz * Lz, 0, 1));
      rim.push(pow(1 - nz, 2.6));
    }
  }

  planet = {
    R, D, texW, texH, surf, cloud, bg,
    idx: Int32Array.from(idx), txf: Float32Array.from(txf),
    rowBase: Int32Array.from(rowBase), light: Float32Array.from(light), rim: Float32Array.from(rim),
    spin, cloudSpin, ambient, cloudStrength, cloudCol, atm,
  };
}

// Vykresli rotující planetu (atmosférická záře + textura přes kouli, fade `alpha`).
function renderPlanet(cx, cy, alpha) {
  const pl = planet;
  if (!pl) return;

  // atmosférická záře za planetou
  const ctx = drawingContext;
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, pl.R * 0.92, cx, cy, pl.R * 1.42);
  grad.addColorStop(0, `rgba(${pl.atm[0] | 0},${pl.atm[1] | 0},${pl.atm[2] | 0},${0.4 * alpha})`);
  grad.addColorStop(1, `rgba(${pl.atm[0] | 0},${pl.atm[1] | 0},${pl.atm[2] | 0},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, pl.R * 1.42, 0, TWO_PI); ctx.fill();
  ctx.restore();

  const buf = planetBuffer; buf.loadPixels();
  const px = buf.pixels, surf = pl.surf, cloud = pl.cloud, texW = pl.texW;
  const spinFrac = (introTimer * pl.spin) / texW;
  const cloudFrac = (introTimer * pl.cloudSpin) / texW;
  const amb = pl.ambient, cs = pl.cloudStrength, cc = pl.cloudCol, atm = pl.atm;
  const N = pl.idx.length;
  for (let k = 0; k < N; k++) {
    const base = pl.rowBase[k];
    let f = pl.txf[k] + spinFrac; f -= floor(f);
    const o = (base + ((f * texW) | 0)) * 3;
    const lf = amb + (1 - amb) * pl.light[k];
    let r = surf[o] * lf, g = surf[o + 1] * lf, b = surf[o + 2] * lf;
    let cf = pl.txf[k] + cloudFrac; cf -= floor(cf);
    const ca = cloud[base + ((cf * texW) | 0)] / 255 * cs * lf;
    if (ca > 0) { r += (cc[0] - r) * ca; g += (cc[1] - g) * ca; b += (cc[2] - b) * ca; }
    const rm = pl.rim[k];
    r += atm[0] * rm * 0.5; g += atm[1] * rm * 0.5; b += atm[2] * rm * 0.5;
    const p = pl.idx[k];
    px[p] = r > 255 ? 255 : r; px[p + 1] = g > 255 ? 255 : g; px[p + 2] = b > 255 ? 255 : b; px[p + 3] = 255;
  }
  buf.updatePixels();
  push(); tint(255, 255 * alpha); image(buf, cx - pl.R, cy - pl.R); pop();
}

// Rozmísti startovní zóny: F*zonesPerFaction bodů po ploše tak, aby každé dva
//  měly aspoň minZoneDistance. Rejection sampling; když se to nepovede (odstup
//  je na danou plochu nereálný), odstup se chytře zmenší a zkusí znovu.
function generateSpawnZones(F) {
  const sc = CONFIG.scene;
  const total = F * max(1, sc.zonesPerFaction);
  const zoneR = min(width, height) * sc.spawnZoneRadius;
  const pad = zoneR + CONFIG.entitySize;           // zóna se vejde celá do hřiště
  const fieldW = width - CONFIG.arena.panelMinFraction * width;   // bez panelu vpravo
  const availW = max(1, fieldW - 2 * pad);
  const availH = max(1, height - 2 * pad);

  let minDist = sc.minZoneDistance;
  let points = null;
  for (let attempt = 0; attempt < 14 && !points; attempt++) {
    points = tryPlacePoints(total, minDist, pad, availW, availH);
    if (!points) {
      const reduced = minDist * 0.8;
      console.warn(`Spawn zóny: odstup ${minDist.toFixed(0)} px je na plochu ` +
        `${width}×${height} pro ${total} zón nereálný → zmenšuji na ${reduced.toFixed(0)} px.`);
      minDist = reduced;
    }
  }
  if (!points) {   // krajní záchrana: rozházej náhodně bez záruky odstupu
    points = [];
    for (let i = 0; i < total; i++) points.push({ x: pad + random(availW), y: pad + random(availH) });
  }

  // přiřaď zóny frakcím tak, aby každá měla zonesPerFaction (rozeseté, ne v klastru)
  const labels = [];
  for (let f = 0; f < F; f++) for (let k = 0; k < sc.zonesPerFaction; k++) labels.push(f);
  shuffle(labels, true);
  return points.map((p, i) => ({ x: p.x, y: p.y, faction: labels[i] }));
}

// Rejection sampling: umísti n bodů s minimálním vzájemným odstupem (nebo null).
function tryPlacePoints(n, minDist, pad, availW, availH) {
  const pts = [];
  const minD2 = minDist * minDist;
  const triesPerPoint = 80;
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let t = 0; t < triesPerPoint; t++) {
      const x = pad + random(availW), y = pad + random(availH);
      let ok = true;
      for (const p of pts) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < minD2) { ok = false; break; }
      }
      if (ok) { pts.push({ x, y }); placed = true; break; }
    }
    if (!placed) return null;   // nepodařilo se → volající zmenší odstup
  }
  return pts;
}

// Spawn: entity každé frakce padají náhodně do některé z jejích zón.
function spawnScene() {
  entities = [];
  const F = lore.factions.length;
  const zones = generateSpawnZones(F);
  const byFaction = Array.from({ length: F }, () => []);
  for (const z of zones) byFaction[z.faction].push(z);
  const zoneR = min(width, height) * CONFIG.scene.spawnZoneRadius;

  for (let f = 0; f < F; f++) {
    for (let k = 0; k < lore.factions[f].count; k++) {
      const fz = byFaction[f];
      const z = fz[floor(random(fz.length))];        // náhodně vybraná zóna frakce
      const a = random(TWO_PI), rr = zoneR * sqrt(random());  // rovnoměrně v kruhu zóny
      entities.push(new Entity(z.x + cos(a) * rr, z.y + sin(a) * rr, f));
    }
  }
  // start: panel už v minimální šířce (hned po intru je legenda vpravo)
  const panel0 = CONFIG.arena.panelMinFraction * width;
  arena = { x0: 0, y0: 0, x1: width - panel0, y1: height, panelW: panel0 };
  // statistiky a feed pro komentář
  factionStats = lore.factions.map(() => ({ predation: 0, starvation: 0, kills: 0, gone: false, lastOne: false }));
  events = [];
  rebuildGrid();
}

// Přidej událost do feedu (nahoru); starší se odsunou a postupně blednou.
function pushEvent(text, color) {
  events.unshift({ text, color, alpha: 1 });
  if (events.length > 6) events.length = 6;
}

// Slovní příčina konce frakce dle poměru ztrát lovem vs. hladem.
function lossCause(f) {
  const s = factionStats[f];
  if (s.starvation > s.predation * 1.3) return 'vyhladověla';
  if (s.predation > s.starvation * 1.3) return 'byla vyhlazena';
  return 'byla zlomena a dolovena';
}

// Začni úplně novou scénu (R / start): nový příběh + intro.
function startNewScene() {
  generateLore();
  makePlanet();
  spawnScene();
  squads = [];               // ať debug nekreslí obálky z minulé scény během intra
  sceneState = 'INTRO';
  fadeAlpha = 1;
  introTimer = 0;
  outroTimer = 0;
  winnerTimer = 0;
  winnerFaction = -1;
}

// Celková délka intra (snímky): rozsvícení všech řádků + dojezd + hold.
function introTotalFrames() {
  const S = CONFIG.scene;
  const lines = 2 + lore.factions.length;   // 2 hlavičkové řádky + řádek na frakci
  return (lines - 1) * S.introLineDelay + S.introLineFade + S.introHold;
}

// Kolik různých frakcí je ještě naživu.
function factionsAlive() {
  const set = new Set();
  for (const e of entities) set.add(e.faction);
  return set;
}

// Vyhodnoť mrtvé: započítej příčinu (lov/hlad), ohlas konec frakce a posl. přeživší.
function processDeaths() {
  const F = lore.factions.length;
  const before = new Array(F).fill(0);
  for (const e of entities) before[e.faction]++;          // vč. právě mrtvých

  for (const e of entities) {
    if (!e.alive) {
      const s = factionStats[e.faction];
      if (e.deathCause === 'starved') s.starvation++; else s.predation++;
    }
  }
  entities = entities.filter(e => e.alive);

  const after = new Array(F).fill(0);
  for (const e of entities) after[e.faction]++;
  for (let f = 0; f < F; f++) {
    const s = factionStats[f];
    if (!s.gone && before[f] > 0 && after[f] === 0) {
      s.gone = true;
      pushEvent(`${lore.factions[f].name} ${lossCause(f)}`, lore.factions[f].color);
    } else if (!s.lastOne && !s.gone && after[f] === 1) {
      s.lastOne = true;
      pushEvent(`${lore.factions[f].name}: poslední přeživší`, lore.factions[f].color);
    }
  }
}

// Stárnutí feedu — události postupně blednou a mizí (~4 s životnost).
function ageEvents() {
  for (const ev of events) ev.alpha -= 1 / 240;
  while (events.length && events[events.length - 1].alpha <= 0) events.pop();
}

// Stavový automat scény: INTRO (titulky) → ACTION (akce, fade-in) →
//  OUTRO (vyhlášení vítěze, fade do černé) → nový příběh → INTRO ...
//  Simulace běží jen v ACTION (řeší draw); zde se posouvají timery a fade.
function updateSceneState() {
  const S = CONFIG.scene;

  if (sceneState === 'INTRO') {
    introTimer++;
    if (introTimer >= introTotalFrames()) sceneState = 'ACTION';  // fadeAlpha=1 → fade-in v ACTION

  } else if (sceneState === 'ACTION') {
    if (fadeAlpha > 0) {                          // náběh akce z černé
      fadeAlpha = max(0, fadeAlpha - 1 / S.fadeInFrames);
    } else {                                      // hra běží: hlídej vítěze
      const alive = factionsAlive();
      if (alive.size <= 1) {
        winnerFaction = alive.size === 1 ? [...alive][0] : -1;
        if (++winnerTimer >= S.winnerHold) { sceneState = 'OUTRO'; outroTimer = 0; }
      } else {
        winnerTimer = 0;
        winnerFaction = -1;
      }
    }

  } else if (sceneState === 'OUTRO') {
    fadeAlpha = min(1, fadeAlpha + 1 / S.fadeOutFrames);   // fade do černé
    if (fadeAlpha >= 1) {
      if (++outroTimer >= S.outroHold) startNewScene();    // hold vítěze → nový příběh + intro
    }
  }
}

function rebuildGrid() {
  grid = new SpatialGrid(width, height, CONFIG.grid.cellSize);
  grid.build(entities);
}

// Tvrdá pojistka: žádná entita nesmí být vně arény. Voláno až po pohybu i
//  rozhrnutí překryvů, takže respektuje, že se zóna ten snímek zmenšila.
//  Při dotyku hranice se vynuluje jen složka rychlosti mířící ven → entita
//  klouže podél hrany (žádné zaseknutí ani prostup).
function confineToArena() {
  for (const e of entities) {
    if (e.position.x < arena.x0)      { e.position.x = arena.x0; if (e.velocity.x < 0) e.velocity.x = 0; }
    else if (e.position.x > arena.x1) { e.position.x = arena.x1; if (e.velocity.x > 0) e.velocity.x = 0; }
    if (e.position.y < arena.y0)      { e.position.y = arena.y0; if (e.velocity.y < 0) e.velocity.y = 0; }
    else if (e.position.y > arena.y1) { e.position.y = arena.y1; if (e.velocity.y > 0) e.velocity.y = 0; }
  }
}

// Smršťování arény (ASYMETRICKY): plocha se zužuje a vpravo přitom vzniká
//  panel na komentář. Velikost roste s podílem žijících entit — každé úmrtí
//  plochu o kousek zmenší a panel o kousek rozšíří.
function updateArena() {
  const A = CONFIG.arena;
  const n = entities.length;
  const startN = max(CONFIG.count, A.fullShrinkCount + 1);   // horní mez = počáteční populace
  // podíl 0..1 mezi nejmenší (n<=fullShrinkCount) a plnou (n>=startN) plochou
  const t = constrain((n - A.fullShrinkCount) / (startN - A.fullShrinkCount), 0, 1);
  const f = lerp(A.minSizeFactor, 1, t);

  // panel vpravo: min šířka hned od začátku, roste k max při úbytku entit
  const u = (1 - f) / (1 - A.minSizeFactor);     // 0 při plné populaci .. 1 při nejmenší
  const targetPanel = lerp(A.panelMinFraction, A.panelMaxFraction, constrain(u, 0, 1)) * width;
  arena.panelW = lerp(arena.panelW || 0, targetPanel, A.smooth);

  // hrací pole = plátno bez panelu vpravo; aréna se v něm smrští (na střed pole)
  const fieldW = width - arena.panelW;
  const cx = fieldW / 2, cy = height / 2;
  const tHalfW = (fieldW / 2) * f, tHalfH = (height / 2) * f;
  const k = A.smooth;
  arena.x0 = lerp(arena.x0, cx - tHalfW, k);
  arena.x1 = lerp(arena.x1, cx + tHalfW, k);
  arena.y0 = lerp(arena.y0, cy - tHalfH, k);
  arena.y1 = lerp(arena.y1, cy + tHalfH, k);
}

// Tvrdé rozhrnutí překryvů: dvojice blíž než 2× bodyRadius odsuneme od sebe.
//  Každá entita posune SEBE o díl překryvu; protějšek se posune při svém
//  zpracování → pár se symetricky rozhrne. Pár relaxačních průchodů stabilizuje
//  i hustá místa (entity se můžou dotýkat/drcnout, ale ne prolnout).
// -------------------------------------------------------------------------
//  Squady — sdílená informační vrstva skupiny (Vrstva A)
// -------------------------------------------------------------------------
// Spojenci stejné frakce se přes blízkost (CONFIG.squad.radius) slévají do
// squadu (union-find → řetězí se do „žížal"; rozpad na podskupiny vzniká sám).
// Squad sdílí agregáty: size, power a KOLEKTIVNÍ odhad nepřítele (jen z toho,
// co někdo z členů vidí → mlha války). Rozhodování pak čte sílu celé skupiny.
function buildSquads() {
  const n = entities.length;
  squads = [];
  if (n === 0) return;

  // --- union-find nad indexy entit ---
  const parent = new Array(n);
  for (let i = 0; i < n; i++) { parent[i] = i; entities[i]._ui = i; entities[i]._foes = null; }
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const SQ = CONFIG.squad;
  const qr = max(SQ.radius, SQ.sightRange);
  const radius2 = SQ.radius * SQ.radius;
  const sight2 = SQ.sightRange * SQ.sightRange;

  // jeden dotaz na entitu: spojenec do radius → union; cizí do sightRange → stash
  for (let i = 0; i < n; i++) {
    const e = entities[i];
    const near = grid.query(e.position.x, e.position.y, qr);
    for (const o of near) {
      if (o === e) continue;
      const d2 = (e.position.x - o.position.x) ** 2 + (e.position.y - o.position.y) ** 2;
      if (o.faction === e.faction) {
        if (d2 <= radius2) union(e._ui, o._ui);
      } else if (d2 <= sight2) {
        (e._foes || (e._foes = [])).push(o);   // viditelný nepřítel (do sdíleného odhadu)
      }
    }
  }

  // --- seskup členy do squad objektů + nasčítej sílu a těžiště ---
  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const e = entities[i];
    const r = find(i);
    let sq = byRoot.get(r);
    if (!sq) {
      sq = { members: [], size: 0, power: 0, cx: 0, cy: 0, faction: e.faction,
             enemies: new Set(), enemyPower: 0, enemyCount: 0,
             hasEnemy: false, enemyCx: 0, enemyCy: 0 };
      byRoot.set(r, sq);
      squads.push(sq);
    }
    sq.members.push(e);
    sq.size++;
    sq.power += e.strength * constrain(e.energy, 0.15, 1);
    sq.cx += e.position.x; sq.cy += e.position.y;
    e.squad = sq;
    if (e._foes) for (const f of e._foes) sq.enemies.add(f);
  }

  // --- dokonči: těžiště + sdílený odhad nepřítele (součet viditelných hlav) ---
  for (const sq of squads) {
    sq.cx /= sq.size; sq.cy /= sq.size;
    let ep = 0, ex = 0, ey = 0, ec = 0;
    for (const f of sq.enemies) {
      if (!f.alive) continue;
      ep += f.strength * constrain(f.energy, 0.15, 1);
      ex += f.position.x; ey += f.position.y; ec++;
    }
    sq.enemyPower = ep; sq.enemyCount = ec;
    if (ec > 0) { sq.hasEnemy = true; sq.enemyCx = ex / ec; sq.enemyCy = ey / ec; }
  }
}

// Convex hull (Andrew monotone chain) z bodů [{x,y}] → pole vrcholů obálky.
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// DEBUG: ÚZEMÍ squadu = sjednocení disků kolem členů (dosah propojení) podbarvené
//  barvou frakce, plus obrysová hranice (convex hull). Vykresluje plochu, ne čáru.
function drawSquads() {
  const SQ = CONFIG.squad;
  const diam = SQ.radius * 0.6 * 2;   // disk kolem každého člena; sousedé se slijí v blob
  push();
  // 1) plocha území — průhledné disky (překryvy se přirozeně slévají do blobu)
  noStroke();
  for (const sq of squads) {
    const col = lore.factions[sq.faction].color;
    fill(col[0], col[1], col[2], SQ.debugFill);
    for (const m of sq.members) if (m.alive) circle(m.position.x, m.position.y, diam);
  }
  // 2) hranice — convex hull kolem členů
  noFill();
  strokeWeight(1.2);
  for (const sq of squads) {
    const pts = [];
    for (const m of sq.members) if (m.alive) pts.push({ x: m.position.x, y: m.position.y });
    if (pts.length < 3) continue;
    const col = lore.factions[sq.faction].color;
    stroke(col[0], col[1], col[2], 130);
    const hull = convexHull(pts);
    beginShape();
    for (const v of hull) vertex(v.x, v.y);
    endShape(CLOSE);
  }
  pop();
}

// DEBUG: štítky squadů „počet·síla [vs odhad nepřítele]" — kreslí se NAKONEC
//  (přes vše) a s tmavým obrysem, ať jsou čitelné na barevné ploše.
function drawSquadLabels() {
  push();
  textAlign(CENTER, CENTER);
  textSize(11);
  strokeJoin(ROUND);
  for (const sq of squads) {
    if (!sq.members.some(m => m.alive)) continue;
    const col = lore.factions[sq.faction].color;
    const label = `${sq.size}·${nf(sq.power, 1, 1)}${sq.hasEnemy ? ' vs ' + nf(sq.enemyPower, 1, 1) : ''}`;
    stroke(0, 0, 0, 210); strokeWeight(3);          // tmavý obrys pro čitelnost
    fill(col[0], col[1], col[2]);
    text(label, sq.cx, sq.cy);
  }
  pop();
}

// Spočítej, kolik útočníků míří na každou entitu (huntTarget) — řídí cap
// CONFIG.combat.maxAttackersPerTarget. Volá se jednou před update smyčkou
// (huntTarget přetrvává mezi snímky, takže jednosnímkové zpoždění nevadí).
function countAttackers() {
  const slot2 = CONFIG.combat.slotRange * CONFIG.combat.slotRange;
  for (const e of entities) e.incomingAttackers = 0;
  for (const e of entities) {
    const t = e.huntTarget;
    if (!t || !t.alive) continue;
    // slot obsadí jen útočník, který je reálně blízko (zapojený/dobíhající),
    // ne ten, co drží mrtvý lock a kulhá daleko vzadu (jinak by blokoval ostatní)
    const d2 = (e.position.x - t.position.x) ** 2 + (e.position.y - t.position.y) ** 2;
    if (d2 <= slot2) t.incomingAttackers++;
  }
}

function resolveOverlaps() {
  const C = CONFIG.collision;
  const base = C.bodyRadius * 2;                 // normální podlaha (klidní spojenci)
  // při SOUBOJI se podlaha měkčí (těla se smí přimáčknout / překrýt) — viz CONFIG.collision
  const allyTight = base * C.allyTightFactor;    // spojenci u fronty (aspoň jeden bojuje)
  const overlap   = base * C.combatOverlapFactor;// útočník ↔ jeho cíl (smí se úplně překrýt)
  const squeeze   = base * C.enemySqueezeFactor; // nebojující cizí (protáhnout se na těsno)

  for (let iter = 0; iter < C.iterations; iter++) {
    for (const e of entities) {
      const near = grid.query(e.position.x, e.position.y, base);
      for (const o of near) {
        if (o === e) continue;

        // jaká rozhrnovací podlaha platí pro TUTO dvojici?
        let minDist;
        if (o.faction === e.faction) {
          minDist = (e.fighting || o.fighting) ? allyTight : base;  // spojenci u kotle na těsno
        } else if (e.huntTarget === o || o.huntTarget === e) {
          minDist = overlap;                                        // útočník ↔ cíl: smí se překrýt
        } else {
          minDist = squeeze;                                        // ostatní cizí: protáhnout se na těsno
        }
        const minD2 = minDist * minDist;

        let dx = e.position.x - o.position.x;
        let dy = e.position.y - o.position.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD2) continue;

        let d = sqrt(d2);
        if (d > 0.0001) { dx /= d; dy /= d; }
        else { const a = random(TWO_PI); dx = cos(a); dy = sin(a); d = 0; } // přesný překryv → náhodný směr

        const shift = (minDist - d) * C.push;   // protějšek dorovná druhou půlku při svém průchodu
        e.position.x += dx * shift;
        e.position.y += dy * shift;
      }
      e.position.x = constrain(e.position.x, 0, width);
      e.position.y = constrain(e.position.y, 0, height);
    }
  }
}

// -------------------------------------------------------------------------
//  p5.js životní cyklus
// -------------------------------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);
  startNewScene();
}

function draw() {
  background(CONFIG.background[0], CONFIG.background[1], CONFIG.background[2]);
  drawWorldBackground();   // tlumený povrch planety jako pozadí hrací plochy

  // grid přestavujeme každý snímek (entity se pohnuly)
  rebuildGrid();

  if (!paused) {
    // simulace běží jen v akci (v intru/outru entity stojí / se vyhodnocují)
    if (sceneState === 'ACTION') {
      updateArena();                 // smrští prostor podle počtu přeživších (1× za snímek)
      // RYCHLOST simulace: simSpeed kroků za snímek. Slow-motion (simSpeed<1)
      //   spustí krok jen jednou za 1/simSpeed snímků; zrychlení provede víc kroků.
      simAccumulator += simSpeed;
      let steps = 0;
      while (simAccumulator >= 1 && steps < 8) {
        rebuildGrid();               // čerstvé sousedství pro tento krok
        buildSquads();               // sdílená informační vrstva skupin (síla, odhad nepřítele)
        countAttackers();            // přepočti obléhající útočníky (cap maxAttackersPerTarget)
        for (const e of entities) e.update();
        if (entities.some(e => !e.alive)) processDeaths();   // statistika + odstranění mrtvých
        rebuildGrid();
        resolveOverlaps();           // těla se nesmí prolnout (mimo souboj)
        confineToArena();            // nikdo nepřekročí hranici (smrštěné) arény
        simAccumulator -= 1;
        steps++;
      }
    } else {
      simAccumulator = 0;            // mimo akci se rychlost neakumuluje
    }
    // životní cyklus scény (intro → akce → outro → nový příběh)
    updateSceneState();
    ageEvents();
  }

  drawArena();

  if (debug) {
    grid.render();
    drawSquads();
    drawNeighborProbe();
  }

  for (const e of entities) e.render();

  drawCommentary();   // panel s legendou a feedem vpravo (roste se smršťováním)

  // překryv pro fade + titulky intra / vyhlášení outra
  drawFade();
  drawIntro();
  drawOutro();

  drawLegendHint();           // tichý náznak "H — legenda"
  if (showLegend) drawLegend();

  if (debug) { drawSquadLabels(); drawHud(); }   // štítky squadů až úplně nakonec (čitelnost)
}

// Černý překryv pro plynulý přechod scén.
function drawFade() {
  if (fadeAlpha <= 0) return;
  push();
  noStroke();
  fill(0, 0, 0, fadeAlpha * 255);
  rect(0, 0, width, height);
  pop();
}

// Intro: titulky se postupně rozsvěcují (svět + řádek na každou frakci).
function drawIntro() {
  if (sceneState !== 'INTRO' || !lore) return;
  const S = CONFIG.scene;

  // sestav řádky: 2 hlavičkové + jeden na frakci
  const n = lore.factions.length;
  const verb = n <= 4 ? 'se utkají' : 'se utká';
  const noun = n <= 4 ? 'frakce' : 'frakcí';
  const lines = [];
  lines.push({ text: `Ve světě ${lore.world}`, size: 30, col: [230, 235, 245] });
  lines.push({ text: `${verb} ${n} ${noun}:`, size: 18, col: [150, 160, 175] });
  for (const f of lore.factions) {
    lines.push({ faction: f, text: `${f.name} — ${f.count} členů`, size: 22, col: f.color });
  }

  // animovaná planeta nahoře (nabíhá s prvním řádkem)
  const planetR = planet ? planet.R : 120;
  const planetCy = height * 0.30;
  const pa = constrain(introTimer / S.introLineFade, 0, 1);
  renderPlanet(width / 2, planetCy, pa);

  // titulky pod planetou
  const lineH = 44;
  let y = planetCy + planetR + 46;

  push();
  textAlign(CENTER, CENTER);
  for (let i = 0; i < lines.length; i++) {
    // postupné rozsvícení: řádek i nabíhá od i*delay
    const a = constrain((introTimer - i * S.introLineDelay) / S.introLineFade, 0, 1);
    const ln = lines[i];
    if (a > 0) {
      // glyf tvaru u řádků frakcí
      if (ln.faction) {
        drawFactionGlyph(width / 2 - textWidthOf(ln.text, ln.size) / 2 - 22, y,
                         ln.faction.shape, 11, ln.faction.color, a);
      }
      noStroke();
      fill(ln.col[0], ln.col[1], ln.col[2], a * 255);
      textSize(ln.size);
      text(ln.text, width / 2, y);
    }
    y += lineH;
  }
  pop();
}

// Outro: vyhlášení vítězné frakce (na černé, po fadu ven).
function drawOutro() {
  if (sceneState !== 'OUTRO' || fadeAlpha < 0.85) return;
  const a = constrain((fadeAlpha - 0.85) / 0.15, 0, 1);
  push();
  textAlign(CENTER, CENTER);
  noStroke();
  fill(150, 160, 175, a * 220);
  textSize(18);
  text(`Ve světě ${lore.world}`, width / 2, height / 2 - 34);

  if (winnerFaction >= 0) {
    const f = lore.factions[winnerFaction];
    drawFactionGlyph(width / 2 - textWidthOf(`zvítězila frakce ${f.name}`, 28) / 2 - 26,
                     height / 2 + 6, f.shape, 13, f.color, a);
    fill(f.color[0], f.color[1], f.color[2], a * 240);
    textSize(28);
    text(`zvítězila frakce ${f.name}`, width / 2, height / 2 + 6);
  } else {
    fill(150, 160, 175, a * 220);
    textSize(24);
    text('nepřežil nikdo', width / 2, height / 2 + 6);
  }
  pop();
}

// pomůcka: šířka textu při dané velikosti (pro umístění glyfu)
function textWidthOf(str, size) {
  push(); textSize(size); const w = textWidth(str); pop(); return w;
}

// Glyf tvaru frakce (pro titulky) — vykreslí polygon mířící doprava.
function drawFactionGlyph(x, y, shapeIdx, size, col, alpha) {
  push();
  translate(x, y);
  noStroke();
  fill(col[0], col[1], col[2], alpha * 255);
  beginShape();
  for (const p of SHAPES[shapeIdx]) vertex(p[0] * size, p[1] * size);
  endShape(CLOSE);
  pop();
}

// Pozadí hrací plochy = povrch planety z intra (ztmavený + ztlumený, ať jasné
//  entity vyniknou). Boids se tak pohybují "nad povrchem" právě toho světa.
function drawWorldBackground() {
  if (!planet || !planet.bg) return;
  const wb = CONFIG.worldBg;
  push();
  // ztmavení přes tint (násobí barvy) — povrch zůstane čitelný, ale tlumený
  tint(wb.tint[0], wb.tint[1], wb.tint[2]);
  image(planet.bg, 0, 0, width, height);
  noTint();
  // ztlumení k základní barvě pozadí, ať textura nepřebíjí entity
  noStroke();
  fill(CONFIG.background[0], CONFIG.background[1], CONFIG.background[2], wb.muteAlpha);
  rect(0, 0, width, height);
  pop();
}

// Hranice smrštěné arény — jemně naznačíme, jen když je menší než plátno.
function drawArena() {
  if (!arena) return;
  if (arena.x0 < 3 && arena.y0 < 3 && arena.x1 > width - 3 && arena.y1 > height - 3) return;
  push();
  noFill();
  stroke(120, 140, 170, 45);
  strokeWeight(1.5);
  rect(arena.x0, arena.y0, arena.x1 - arena.x0, arena.y1 - arena.y0, 8);
  pop();
}

// Panel komentáře vpravo — roste, jak se hrací plocha zužuje. Hlavička světa,
//  strohá tabulka frakcí (glyf, název, populace, úlovky, příčina konce) a
//  dramatický feed posledních událostí.
function drawCommentary() {
  if (!lore || !arena) return;
  const pw = arena.panelW || 0;
  if (pw < 150) return;               // moc úzký panel → ještě nekreslit
  const x = width - pw;

  push();
  textAlign(LEFT, TOP);
  // pozadí panelu + dělící čára
  noStroke();
  fill(255, 255, 255, 6);
  rect(x, 0, pw, height);
  stroke(120, 140, 170, 50);
  strokeWeight(1);
  line(x, 0, x, height);
  noStroke();

  const px = x + 16;
  const rx = x + pw - 16;          // pravý okraj obsahu
  const barW = pw - 32;            // šířka proužku
  let y = 24;

  // hlavička světa: SVĚT / téma · počet frakcí
  const n = lore.factions.length;
  const noun = n <= 4 ? 'frakce' : 'frakcí';
  fill(232, 237, 247); textSize(20);
  text(lore.world, px, y); y += 26;
  fill(140, 150, 165); textSize(12);
  text(`${lore.theme} · ${n} ${noun}`, px, y); y += 26;

  // tabulka frakcí: glyf + název + živí, proužek živí/start, popisek se slovy
  const counts = new Array(n).fill(0);
  for (const e of entities) counts[e.faction]++;
  let maxStart = 1;
  for (const fc of lore.factions) maxStart = max(maxStart, fc.count);

  for (let f = 0; f < n; f++) {
    const fc = lore.factions[f], s = factionStats[f];
    const dim = s.gone ? 0.45 : 1;

    // řádek 1: glyf + název ............ živí
    drawFactionGlyph(px + 7, y + 9, fc.shape, 9, fc.color, dim);
    fill(fc.color[0], fc.color[1], fc.color[2], 255 * dim);
    textAlign(LEFT, TOP); textSize(15);
    text(fc.name, px + 22, y);
    textAlign(RIGHT, TOP); textSize(16);
    text(`${counts[f]}`, rx, y - 1);
    textAlign(LEFT, TOP);
    y += 20;

    // řádek 2: proužek živí vůči startu (rychlý přehled "kdo vede")
    noStroke();
    fill(255, 255, 255, 22);
    rect(px, y, barW, 5, 2);
    fill(fc.color[0], fc.color[1], fc.color[2], 230 * dim);
    rect(px, y, barW * constrain(counts[f] / maxStart, 0, 1), 5, 2);
    y += 11;

    // řádek 3: popisek se slovy
    textSize(11);
    if (s.gone) {
      fill(170, 175, 185, 200);
      text(`${lossCause(f)} · start ${fc.count}`, px, y);
    } else {
      fill(180, 190, 200, 210);
      text(`úlovky ${s.kills} · ztráty ${s.predation + s.starvation} (hlad ${s.starvation})`, px, y);
    }
    y += 22;
  }

  // feed událostí (dramatický)
  y += 6;
  stroke(120, 140, 170, 40); strokeWeight(1); line(px, y, rx, y); noStroke(); y += 12;
  fill(150, 160, 175, 180); textSize(11); textAlign(LEFT, TOP);
  text('UDÁLOSTI', px, y); y += 18;
  textSize(13);
  for (const ev of events) {
    const a = constrain(ev.alpha, 0, 1);
    fill(ev.color[0], ev.color[1], ev.color[2], a * 235);
    text('› ' + ev.text, px, y);
    y += 20;
    if (y > height - 18) break;
  }
  pop();
}

// Tichý náznak, že legenda je na klávese H (mizí, když je legenda otevřená).
function drawLegendHint() {
  if (showLegend) return;
  push();
  noStroke();
  fill(150, 160, 175, 130);
  textSize(12);
  textAlign(RIGHT, BOTTOM);
  text('H — legenda', width - 12, height - 10);
  pop();
}

// Ukázková entita pro legendu (stejné vykreslení jako ve hře).
function drawSampleEntity(x, y, opt) {
  const s = opt.size, col = opt.col || [180, 190, 205], shape = opt.shape || 0;
  let r = col[0], g = col[1], b = col[2];
  if (opt.glow > 0) { r = lerp(r, 255, opt.glow); g = lerp(g, 255, opt.glow); b = lerp(b, 255, opt.glow); }
  else if (opt.glow < 0) { const k = 1 + opt.glow; r *= k; g *= k; b *= k; }
  push();
  if (opt.ring) {
    noFill(); stroke(120, 255, 160, 200); strokeWeight(1.5);
    circle(x, y, s * 3.4);
  }
  translate(x, y);
  if (opt.fight) { stroke(255, 90, 60, 230); strokeWeight(1.8); }
  else if (opt.outline) { stroke(255, 255, 255, 220); strokeWeight(1.5); }
  else noStroke();
  fill(r, g, b);
  beginShape();
  for (const p of SHAPES[shape]) vertex(p[0] * s, p[1] * s);
  endShape(CLOSE);
  pop();
}

// Legenda (klávesa H): co znamená grafika + stručná pravidla chování.
function drawLegend() {
  const W = 470, pad = 22, rowH = 30;
  const visuals = [
    { draw: (x, y) => { drawSampleEntity(x - 7, y, { size: 6 }); drawSampleEntity(x + 10, y, { size: 12 }); },
      text: 'Velikost = energie (zásoba sil). Malá = vyhladovělá, velká = najedená.' },
    { draw: (x, y) => drawSampleEntity(x, y, { size: 11, glow: 0.4 }),
      text: 'Světlejší = sprint (zrychlení) nebo čerstvě nasycená po úlovku.' },
    { draw: (x, y) => drawSampleEntity(x, y, { size: 11, glow: -0.45 }),
      text: 'Tmavší = strach (prchá) nebo zadýchání (vyčerpaná stamina).' },
    { draw: (x, y) => drawSampleEntity(x, y, { size: 11, outline: true }),
      text: 'Bílý obrys = právě loví (vybrala si kořist a pronásleduje ji).' },
    { draw: (x, y) => drawSampleEntity(x, y, { size: 11, fight: true }),
      text: 'Červený obrys = souboj (ukusuje soupeři život a soupeř jí zpět).' },
    { draw: (x, y) => drawSampleEntity(x, y, { size: 10, ring: true }),
      text: 'Zelený prstenec = léčí se v hejnu (zdraví spojenci jí dávají energii).' },
    { draw: (x, y) => { drawSampleEntity(x - 8, y, { size: 11, shape: 0, col: [90, 200, 255] }); drawSampleEntity(x + 9, y, { size: 11, shape: 2, col: [255, 110, 185] }); },
      text: 'Tvar a barva = příslušnost k frakci.' },
  ];
  const rules = [
    'Stejná barva drží spolu (hejna), cizí barvy se navzájem loví.',
    'Hlad roste v čase a nutí lovit; čím hladovější, tím ochotnější riskovat.',
    'Energie pomalu ubývá; sprint ji i staminu vyčerpá → zadýchání a zpomalení.',
    'Útěk vs. boj = strach proti odvaze; v koutě i srab bojuje, kořist kouše i v útěku.',
    'Souboj = oboustranné ukusování; silnější a méně zadýchaný vítězí, vítěz pak slábne.',
    'Přesila láká k útoku, sevřené hejno (i silný jedinec) útočníka odrazí.',
    'Zraněná entita se stáhne do hejna, kde ji po boji zdraví léčí.',
    'Když přežije jediná frakce, scéna končí a začne nová.',
  ];

  const H = pad * 2 + 26 + visuals.length * rowH + 28 + rules.length * 22 + 20;
  const x0 = (width - W) / 2, y0 = (height - H) / 2;

  push();
  // pozadí
  noStroke();
  fill(8, 12, 18, 238);
  rect(x0, y0, W, H, 12);
  stroke(120, 140, 170, 80); strokeWeight(1); noFill();
  rect(x0, y0, W, H, 12);
  noStroke();

  let y = y0 + pad + 8;
  const tx = x0 + pad;

  fill(232, 237, 247); textSize(18); textAlign(LEFT, CENTER);
  text('Legenda — co která grafika znamená', tx, y); y += 30;

  textSize(13);
  for (const v of visuals) {
    v.draw(tx + 12, y);
    fill(205, 213, 223);
    text(v.text, tx + 40, y);
    y += rowH;
  }

  y += 8;
  fill(150, 160, 175); textSize(13);
  text('Pravidla chování', tx, y); y += 22;
  fill(190, 198, 210); textSize(12.5);
  for (const r of rules) {
    text('•  ' + r, tx, y);
    y += 22;
  }
  pop();
}

// Debug sonda: vybere entitu nejblíž středu plátna a zvýrazní, KOHO vnímá.
//  Zelená čára = vnímaný spojenec, červená = vnímaná cizí entita.
//  Ukazuje, že vnímání respektuje kužel + proxy (nikoli prostý poloměr).
function drawNeighborProbe() {
  if (entities.length === 0) return;

  // vyber entitu nejblíž středu plátna (stabilní volba bez náhody)
  let probe = entities[0];
  let best = Infinity;
  const cx = width / 2, cy = height / 2;
  for (const e of entities) {
    const d2 = (e.position.x - cx) ** 2 + (e.position.y - cy) ** 2;
    if (d2 < best) { best = d2; probe = e; }
  }

  const perceived = probe.perceive();

  push();
  strokeWeight(1.5);
  for (const n of perceived) {
    if (n.faction === probe.faction) stroke(120, 255, 150, 180);  // spojenec
    else stroke(255, 90, 90, 180);                                // cizí
    line(probe.position.x, probe.position.y, n.position.x, n.position.y);
  }

  // zvýrazni sondu
  noStroke();
  fill(255);
  circle(probe.position.x, probe.position.y, 7);

  // textový stav sondy
  fill(230);
  textSize(11);
  textAlign(LEFT, BOTTOM);
  let state = probe.fighting ? 'FIGHT'
            : (probe.fleeing ? 'FLEE'
            : (probe.rallying ? 'RALLY'
            : (probe.deterred ? 'DETER' : probe.role)));
  if (probe.sprinting) state += '+SPRINT';
  else if (probe.winded) state += '+WINDED';
  text(`${probe.character} ${state}  hlad:${nf(probe.hunger,1,2)} ` +
       `strach:${nf(probe.fear,1,2)} odvaha:${nf(probe.courage,1,2)} spoj:${probe.localAllies}`,
       probe.position.x + 10, probe.position.y - 20);
  const sq = probe.squad;
  text(`energie:${nf(probe.energy,1,2)}  stamina:${nf(probe.stamina,1,2)} ` +
       `síla:${nf(probe.strength,1,2)} útoč:${probe.incomingAttackers}`,
       probe.position.x + 10, probe.position.y - 8);
  if (sq) {
    text(`squad: ${sq.size} ks, síla ${nf(sq.power,1,1)}` +
         (sq.hasEnemy ? ` vs nepřítel ${nf(sq.enemyPower,1,1)}` : ''),
         probe.position.x + 10, probe.position.y + 4);
  }
  pop();
}

function drawHud() {
  const F = lore ? lore.factions.length : 0;
  // počty podle frakcí + predátoři
  const perFaction = new Array(F).fill(0);
  let predators = 0;
  for (const e of entities) {
    perFaction[e.faction]++;
    if (e.role === 'PREDATOR') predators++;
  }

  push();
  noStroke();
  fill(150, 160, 175);
  textSize(12);
  textAlign(LEFT, TOP);
  const speedLabel = paused ? 'PAUZA' : (simSpeed === 1 ? '' : `${simSpeed}×`);
  text(`FPS: ${nf(frameRate(), 0, 0)}   entit: ${entities.length}   ` +
       `predátoři: ${predators}   [${sceneState}]` + (speedLabel ? '  ' + speedLabel : ''), 10, height - 40);

  // počty frakcí obarvené (s názvem)
  let x = 10;
  for (let i = 0; i < F; i++) {
    const col = lore.factions[i].color;
    fill(col[0], col[1], col[2]);
    const label = `● ${lore.factions[i].name}: ${perFaction[i]}`;
    text(label, x, height - 22);
    x += textWidth(label) + 16;
  }
  pop();
}

// -------------------------------------------------------------------------
//  Ovládání
// -------------------------------------------------------------------------
function keyPressed() {
  if (key === ' ') paused = !paused;
  else if (key === 'd' || key === 'D') debug = !debug;
  else if (key === 'r' || key === 'R') startNewScene();
  else if (key === 'h' || key === 'H') showLegend = !showLegend;
  // rychlost simulace: − zpomalí (až slow-motion), + zrychlí; 0 vrátí normál
  else if (key === '-' || key === '_') simSpeed = max(0.125, simSpeed / 2);
  else if (key === '+' || key === '=') simSpeed = min(8, simSpeed * 2);
  else if (key === '0') simSpeed = 1;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
