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

## Technologie

p5.js (CDN), čistý JavaScript. Hledání sousedů přes prostorovou mřížku
(spatial grid), aby simulace zvládla ~100–200 entit plynule.
