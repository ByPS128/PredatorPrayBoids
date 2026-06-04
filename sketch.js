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
    visionRange: 95,         // dosah zorného kužele
    visionAngle: 130,        // úhel kužele ve stupních (celková šíře)
    proxyRange: 34,          // poloměr blízké detekce (sluch) — kolem dokola
  },

  // --- Boids (klasické hejnové chování v rámci frakce) ---
  boids: {
    separationRange: 32,     // pod touto vzdáleností se sousedé odpuzují (širší = vyhne se dřív)
    separationWeight: 2.6,   // síla "nenarážej do druhých" (měkké vyhýbání)
    alignmentWeight: 1.0,    // síla srovnání směru se spojenci
    cohesionWeight: 0.9,     // síla držet se ke středu hejna
  },

  // --- Kolize (tvrdé rozhrnutí překryvů — těla se nesmí prolnout) ---
  // Pojistka nad rámec steeringu: po pohybu odsuneme dvojice, které se
  // překrývají, od sebe. Můžou se drcnout, ale ne projít skrz (jako lidi v davu).
  collision: {
    bodyRadius: 6,           // poloměr "těla"; dvě entity se nepřiblíží blíž než 2× tohle
    iterations: 2,           // počet relaxačních průchodů za snímek (víc = pevnější)
    push: 0.5,               // jak velký díl překryvu se odstraní za průchod (0.5 = symetricky půl/půl)
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

    satiatedSpeedFactor: 0.5,// nasycená entita zpomalí (násobek cruise rychlosti)

    killRange: 12,           // na jakou vzdálenost predátor kořist "sní"
    satiationHunger: 0.05,   // hlad po nasycení spadne na tuto hodnotu
    satiationFrames: 180,    // jak dlouho (snímků) trvá nasycení (~3 s)

    pursueWeight: 2.4,       // váha pronásledování kořisti
    predictFrames: 12,       // o kolik snímků dopředu predikovat pohyb kořisti
    huntCohesionFactor: 0.25,// uvnitř lovu se kohéze ke hejnu ztlumí
    lockFrames: 50,          // závazek k cíli: jak dlouho pronásleduje i mimo dohled (~0.8 s)
    maxChase: 160,           // nad tuto vzdálenost cíl vzdá (px)
  },

  // --- Energie (dlouhodobá rezerva "síly") ---
  // Klesá v čase (metabolismus), sprint ji ubírá rychleji. Cruise rychlost
  // se od ní odvíjí → kdo dlouho nejedl, slábne a zpomaluje. Při 0 = smrt hladem.
  energy: {
    start: [0.6, 1.0],       // počáteční rezerva (náhodně v rozsahu)
    metabolism: 0.00010,     // základní pokles za snímek (~2,8 min z plné při klidu)
    sprintDrain: 0.0005,     // přídavný pokles při sprintu
    eatGain: 0.6,            // kolik energie doplní jeden úlovek
    maxEnergy: 1.3,          // strop — lze se "přejíst" na rezervu nad 100 % (štědřejší dárce)
    minCruise: 0.45,         // cruise rychlost při energii=0 (násobek base; při energii=1 je to base)
  },

  // --- Skupinový healing (zranění/nízká energie + pomoc hejna) ---
  // Zraněná entita lne k hejnu; zdraví spojenci jí postupně darují energii
  // ze svého PŘEBYTKU nad komfortní mezí. Dárci nikdy neklesnou pod komfort.
  heal: {
    seekThreshold: 0.45,     // pod touto energií se entita cítí zraněná → silněji vyhledá hejno
    seekBoost: 2.0,          // násobek koheze ke spojencům, když je zraněná
    comfortThreshold: 0.7,   // hranice komfortu: dárce dává jen z přebytku nad ní, příjemce se hojí jen do ní
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

  // --- Fear (strach — dynamický) ---
  fear: {
    riseRate: 0.05,          // jak rychle roste při hrozbě
    decay: 0.010,            // přirozený pokles za snímek
    safeDecayBonus: 0.02,    // rychlejší pokles v bezpečí (spojenci, žádná hrozba)
    predatorMenace: 0.45,    // o kolik je děsivější aktivně lovící predátor (bezprostřední, čísly neškálováno)
    targetedBonus: 0.6,      // přídavek strachu, když si mě cizí vybral za kořist ("jde po MNĚ")
    threatGate: 0.3,         // od jaké hrozivosti se cizí počítá jako reálná hrozba
    fleeHysteresis: 0.12,    // útěk se nevypne hned na prahu (proti blikání rozhodnutí)
    allyBravery: 0.05,       // o kolik dodá odvahy každý blízký spojenec
    allyBraveryMax: 0.35,    // strop bonusu odvahy od hejna
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
    PROTECTOR: { cohesion: 1.4, protect: 1.0, huntThresholdAdd: 0.15, pursue: 0.85 },
    ATTACKER:  { cohesion: 0.7, protect: 0.25, huntThresholdAdd: -0.15, pursue: 1.25 },
  },

  // --- Vizuál ---
  entitySize: 9,             // velikost entity (délka)
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
//  Globální stav
// -------------------------------------------------------------------------
let entities = [];
let grid;                    // SpatialGrid — přestavuje se každý snímek
let arena;                   // {x0,y0,x1,y1} — smršťující se hrací prostor
let paused = false;
let debug = false;
let showLegend = false;      // legenda vizuálních stavů + pravidel (klávesa H)

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
    this.satiationTimer = 0;       // > 0 => nasycená (dočasně neloví)
    this.huntTarget = null;        // aktuální cíl lovu (pro chování + debug)

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
    this.fear = 0;                 // dynamický 0..1
    this.fleeing = false;          // utíká právě teď?
    this.localAllies = 0;          // počet vnímaných spojenců (síla v počtech, čtou i cizí)
    this.deterred = false;         // chtěl by lovit, ale odradila ho převaha kořisti
    this.nearestThreat = null;     // nejbližší hrozba (čtou ji i protectoři spojenců)
    this.jukeTimer = floor(random(CONFIG.flee.jukeIntervalFrames[1])); // klička
    this.jukeDir = 1;              // strana zalomení (+1 / -1)
  }

  get satiated() { return this.satiationTimer > 0; }

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
    const range = CONFIG.boids.separationRange;
    const r2 = range * range;
    for (const o of neighbors) {
      const diff = p5.Vector.sub(this.position, o.position);
      const d2 = diff.magSq();
      if (d2 > 0 && d2 < r2) {
        diff.setMag(1 / sqrt(d2));   // 1/d váhování
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
    const support = 1 + this.localAllies;
    const protection = 1 + f.localAllies;
    const ratio = support / protection;
    let need = D.baseRatio - this.hunger * D.hungerBravado;
    if (this.character === 'ATTACKER') need -= D.attackerBravado;
    need = max(D.minNeed, need);
    return ratio >= need;
  }

  // ---- vyber kořist: nejbližší cizí, na kterou si troufnu zaútočit ----
  //  (izolovanou kořist nechá projít deterrence, kořist v sevřeném hejnu odradí)
  pickPrey(foes) {
    let best = null, bestD2 = Infinity;
    for (const f of foes) {
      if (!f.alive) continue;
      if (!this.willingToAttack(f)) continue;   // odrazen převahou kořisti
      const d2 = p5.Vector.sub(f.position, this.position).magSq();
      if (d2 < bestD2) { bestD2 = d2; best = f; }
    }
    return best;
  }

  // ---- pokus o sežrání kořisti (když je v dosahu killRange) ----
  tryEat(prey) {
    if (!prey.alive) return;
    const d2 = p5.Vector.sub(prey.position, this.position).magSq();
    if (d2 <= CONFIG.hunt.killRange * CONFIG.hunt.killRange) {
      prey.alive = false;                       // kořist umírá (odstraní se po snímku)
      prey.deathCause = 'eaten';                // příčina smrti (pro statistiku/komentář)
      this.hunger = CONFIG.hunt.satiationHunger; // nasycení
      this.energy = min(CONFIG.energy.maxEnergy, this.energy + CONFIG.energy.eatGain); // doplnění rezervy (lze přejíst)
      this.satiationTimer = CONFIG.hunt.satiationFrames;
      this.huntTarget = null;
      factionStats[this.faction].kills++;
      // dramatický feed (sampling, ať se to nezahltí)
      if (random() < 0.4) {
        const hunter = lore.factions[this.faction].name;
        const victim = lore.factions[prey.faction].name;
        pushEvent(`${hunter} dostihl(a) ${victim}`, lore.factions[this.faction].color);
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
    const H = CONFIG.hunt;

    // 1) hlad a nasycení v čase (rychlost se počítá až po rozhodnutí, viz krok 7b)
    if (this.satiationTimer > 0) this.satiationTimer--;
    this.hunger = min(1, this.hunger + H.hungerRate);

    // 3) koho entita vnímá (zorný kužel + proxy), rozděleno na spojence / cizí
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
    const myStrength = 1 + this.localAllies;

    // 4) hrozby mezi vnímanými cizími: hrozivost = potenciální (hlad, ŠKÁLOVANÁ
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

      // poměr sil: jeho_ochrana / moje_síla  (>1 = soupeř silnější → děsivější)
      const foeStrength = 1 + f.localAllies;
      const numFactor = constrain(foeStrength / myStrength, D.numMin, D.numMax);

      let menace = f.hunger * numFactor;                      // potenciální (škálovaná čísly)
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

    // 5) strach: roste s hrozbou, jinak klesá (v bezpečí rychleji)
    if (threatSum > 0) {
      this.fear = min(1, this.fear + threatSum * F.riseRate);
    } else {
      const dec = F.decay + (allies.length > 0 ? F.safeDecayBonus : 0);
      this.fear = max(0, this.fear - dec);
    }

    // odvaha posílená blízkým hejnem (sevřené hejno = větší kuráž)
    const bravery = this.courage +
      min(allies.length * F.allyBravery, F.allyBraveryMax);

    // 6) rozhodnutí útěk vs. zůstat = strach vs. odvaha (s hysterezí proti blikání:
    //    jakmile už utíká, vypne se až když strach klesne pod práh o margin)
    const fleeThreshold = this.fleeing ? bravery - F.fleeHysteresis : bravery;
    this.fleeing = !!this.nearestThreat && (this.fear > fleeThreshold);

    // 7) role/lov: jen když neutíká, není nasycená a hlad překročí
    //    charakterem upravený práh (ATTACKER loví ochotněji).
    //    KOMMITMENT: jakmile si vybere oběť, drží se jí (lock) — i mimo dohled —
    //    dokud nezemře / není moc daleko / není odrazena. Žádné cukání mezi cíli.
    const effHuntThreshold = H.huntThreshold + mods.huntThresholdAdd;
    const wantsToHunt = !this.fleeing && !this.satiated && this.hunger >= effHuntThreshold;

    if (this.huntTarget) {
      const t = this.huntTarget;
      if (foes.includes(t)) this.huntLock = H.lockFrames;   // vidím ho → obnov závazek
      else this.huntLock--;                                 // mimo dohled → odpočet
      const tooFar = p5.Vector.sub(t.position, this.position).magSq() > H.maxChase * H.maxChase;
      if (!t.alive || tooFar || this.huntLock <= 0 || !wantsToHunt || !this.willingToAttack(t)) {
        this.huntTarget = null;
      }
    }
    if (wantsToHunt && !this.huntTarget) {                   // nový cíl jen když žádný nedrží
      this.huntTarget = this.pickPrey(foes);
      if (this.huntTarget) this.huntLock = H.lockFrames;
    }
    // "odrazen": chtěl lovit a kořist v dohledu byla, ale převaha ho odradila
    this.deterred = wantsToHunt && !this.huntTarget && foes.length > 0;
    this.role = this.huntTarget ? 'PREDATOR' : 'PREY';

    // 7a) skupinový healing: zraněný přijme energii od zdravých spojenců
    //     (před výpočtem smrti hladem — hejno tě může vytáhnout z nuly)
    this.receiveHealing(allies);

    // 7b) energie, stamina a výsledná rychlost
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

    // energie: metabolismus (+ sprint navíc); při 0 entita umírá hladem
    this.energy -= EN.metabolism + (sprinting ? EN.sprintDrain : 0);
    if (this.energy <= 0) { this.energy = 0; this.alive = false; this.deathCause = 'starved'; return; }

    // cruise rychlost dle energie (přebytek nad 1.0 je jen rezerva, ne rychlost)
    let cruise = this.baseMaxSpeed * lerp(EN.minCruise, 1, min(1, this.energy));
    if (this.satiated) cruise *= H.satiatedSpeedFactor;
    if (sprinting)        this.maxSpeed = cruise * ST.sprintMult;
    else if (this.winded) this.maxSpeed = cruise * ST.windedFactor;
    else                  this.maxSpeed = cruise;

    // 8) klasické boids síly v rámci frakce
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
      // --- LOV --- miř na kořist (predikce) a případně sežer
      this.applyForce(this.pursue(this.huntTarget).mult(H.pursueWeight * mods.pursue));
      this.tryEat(this.huntTarget);
    } else if (this.character === 'PROTECTOR') {
      // --- OCHRANA --- vmezeř se mezi ohroženého spojence a hrozbu
      this.applyForce(
        this.protect(allies, bravery).mult(CONFIG.protect.weight * mods.protect)
      );
    }

    // 9) wander se ztlumí, když má entita kolem sebe spojence (drží hejno),
    //    a při útěku/lovu ho potlačíme úplně (entita má jasný cíl)
    let wanderWeight = allies.length > 0
      ? CONFIG.wanderFlockWeight
      : CONFIG.wanderLoneWeight;
    if (this.fleeing || this.huntTarget) wanderWeight = 0;
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

    // predátor s cílem dostane jemný světlý obrys (je vidět, že loví)
    if (this.role === 'PREDATOR') {
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
  spawnScene();
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
function resolveOverlaps() {
  const C = CONFIG.collision;
  const minDist = C.bodyRadius * 2;
  const minD2 = minDist * minDist;

  for (let iter = 0; iter < C.iterations; iter++) {
    for (const e of entities) {
      const near = grid.query(e.position.x, e.position.y, minDist);
      for (const o of near) {
        if (o === e) continue;
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

  // grid přestavujeme každý snímek (entity se pohnuly)
  rebuildGrid();

  if (!paused) {
    // simulace běží jen v akci (v intru/outru entity stojí / se vyhodnocují)
    if (sceneState === 'ACTION') {
      updateArena();                 // smrští prostor podle počtu přeživších
      for (const e of entities) e.update();
      // vyhodnoť mrtvé (statistika příčin + konec frakce) a odstraň je
      if (entities.some(e => !e.alive)) processDeaths();
      // tvrdé rozhrnutí překryvů (na čerstvých pozicích) — těla se nesmí prolnout
      rebuildGrid();
      resolveOverlaps();
      // tvrdé udržení uvnitř (smrštěné) arény — nikdo nesmí překročit hranici ven
      confineToArena();
    }
    // životní cyklus scény (intro → akce → outro → nový příběh)
    updateSceneState();
    ageEvents();
  }

  drawArena();

  if (debug) {
    grid.render();
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

  if (debug) drawHud();
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
  const verb = n <= 4 ? 'utkají se' : 'utká se';
  const noun = n <= 4 ? 'frakce' : 'frakcí';
  const lines = [];
  lines.push({ text: `Ve světě ${lore.world}`, size: 30, col: [230, 235, 245] });
  lines.push({ text: `${verb} ${n} ${noun}:`, size: 18, col: [150, 160, 175] });
  for (const f of lore.factions) {
    lines.push({ faction: f, text: `${f.name} — ${f.count} členů`, size: 22, col: f.color });
  }

  const lineH = 46;
  const totalH = lines.length * lineH;
  let y = height / 2 - totalH / 2 + lineH / 2;

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
  if (opt.outline) { stroke(255, 255, 255, 220); strokeWeight(1.5); } else noStroke();
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
    { draw: (x, y) => drawSampleEntity(x, y, { size: 10, ring: true }),
      text: 'Zelený prstenec = léčí se v hejnu (zdraví spojenci jí dávají energii).' },
    { draw: (x, y) => { drawSampleEntity(x - 8, y, { size: 11, shape: 0, col: [90, 200, 255] }); drawSampleEntity(x + 9, y, { size: 11, shape: 2, col: [255, 110, 185] }); },
      text: 'Tvar a barva = příslušnost k frakci.' },
  ];
  const rules = [
    'Stejná barva drží spolu (hejna), cizí barvy se navzájem loví.',
    'Hlad roste v čase a nutí lovit; čím hladovější, tím ochotnější riskovat.',
    'Energie pomalu ubývá; sprint ji i staminu vyčerpá → zadýchání a zpomalení.',
    'Útěk vs. obrana = strach proti odvaze; blízké hejno dodává odvahu.',
    'Přesila láká k útoku, sevřené hejno útočníka odrazí.',
    'Zraněná entita se stáhne do hejna, kde ji zdraví léčí.',
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
  let state = probe.fleeing ? 'FLEE' : (probe.deterred ? 'DETER' : probe.role);
  if (probe.sprinting) state += '+SPRINT';
  else if (probe.winded) state += '+WINDED';
  text(`${probe.character} ${state}  hlad:${nf(probe.hunger,1,2)} ` +
       `strach:${nf(probe.fear,1,2)} odvaha:${nf(probe.courage,1,2)} spoj:${probe.localAllies}`,
       probe.position.x + 10, probe.position.y - 20);
  text(`energie:${nf(probe.energy,1,2)}  stamina:${nf(probe.stamina,1,2)}`,
       probe.position.x + 10, probe.position.y - 8);
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
  text(`FPS: ${nf(frameRate(), 0, 0)}   entit: ${entities.length}   ` +
       `predátoři: ${predators}   [${sceneState}]` + (paused ? ' PAUZA' : ''), 10, height - 40);

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
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
