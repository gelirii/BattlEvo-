# BattlEvo

BattlEvo is a dependency-free browser neural-evolution arcade. Three independently evolving species — **Red, Green and Blue** — receive the same movement, projectile physics, evolutionary rules and tactical information. The player changes the hidden-neuron count for each species, chooses a scenario, and watches different brain sizes learn.

The runtime is plain HTML/CSS/JavaScript and Canvas. There is no build step or runtime library dependency.

## v1.0.0 RC6 rules

- **Hidden neurons:** 1–64 per species.
- **Network:** **599 inputs → one user-sized hidden layer → 18 outputs**.
- **Population:** 16 creatures per species / 48 total.
- **Evaluation:** four independently randomised trials per genetic generation; fitness is averaged before breeding.
- **Creature / target / Invader speed:** 1.65 px/tick ≈ 99 px/s at 60 simulation ticks/s.
- **Projectile speed:** 4.6 px/tick ≈ 276 px/s, or 2.788× creature speed.
- **Movement:** eight compass directions plus still.
- **Aiming:** continuous through the full 360° and independent of movement.
- **Perception is 360° tactical screen-state**, not a forward field of view.
- **Bunkers are always known static geometry**, physically block projectiles, and set the clear-line-of-sight state of dynamic objects without erasing their known locations.
- Species never interbreed.

A genetic generation contains four real game rounds. Lifetime scoreboards count every completed round, while natural selection waits until all four trials are complete.

## Tactical perception

RC5 replaced the old 77-input, 180° sector vision and remembered-bunker model with a structured screen-state. RC6 keeps that 599-input layout but changes occlusion to behave more like a player who can see the whole game state while still understanding cover.

Every creature always receives its own absolute, normalised arena coordinates and all bunker geometry. Scenario-relevant dynamic objects retain their absolute location, motion and other attributes even when a bunker sits between the creature and that object. The first state value in each populated actor/projectile slot is the current clear-line-of-sight state: **1 = visible / clear shot, 0 = occluded by cover**. Irrelevant species/projectiles remain absent entirely.

The fixed tactical tables are:

- 6 bunker slots — all possible current bunkers;
- 15 friendly-creature slots — every possible teammate;
- 32 enemy-creature slots — every possible Battle Royale opponent;
- 12 nearest relevant friendly-projectile slots;
- 24 nearest relevant hostile-projectile slots.

Actors are distance-sorted from the evaluating creature and include visibility, absolute x/y, x/y motion, aiming direction and health where applicable. Projectile slots include visibility, absolute x/y and x/y velocity. Empty slots are zero.

Projectile tables are intentionally bounded. Actors and cover are complete, while representing every simultaneously existing bullet as a permanent fully-connected input would make the genome and mobile CPU cost grow without bound during projectile-heavy fights.

### Scenario vocabulary

**Target Practice**

- moving targets are enemies;
- teammates and other species do not exist in perception;
- only that individual creature's own projectiles are represented;
- all other creatures' projectiles are absent;
- target species-status dots are not rendered.

**Battlefield Run**

- same-species creatures are teammates;
- same-species projectiles are friendly projectiles if present, although agents normally cannot fire in this mode;
- battlefield arrows are hostile projectiles;
- other species and their projectiles do not exist in perception.

**Invaders**

- Invaders are enemies;
- same-species creatures are teammates;
- same-species shots are friendly projectiles;
- only Invader shots aimed at that species are hostile projectiles;
- other species and their projectiles do not exist in perception.

**Battle Royale**

- same-species creatures and shots are friendly;
- both other colours are enemies;
- both other colours' shots are hostile projectiles.

The intent is that **friend, enemy, friendly projectile and hostile projectile keep the same meaning in every scenario**, so practice modes do not teach contradictory colour semantics.

## Continuous aiming

The output layer remains 18-wide for RC5 save compatibility:

- outputs 0–8 choose still / eight-way movement;
- outputs 9–16 are eight directional **aim votes** around the compass;
- output 17 is fire.

RC5 treated the eight aim outputs as winner-take-all compass choices. RC6 converts all eight values into a weighted circular vector. A single dominant direction still aims exactly as before, while combinations can produce any intermediate angle — for example equal east and north-east preference produces a 22.5° shot. The creature's bright nose line and fired projectile use this exact continuous vector.

Bunker collision remains physical. Knowing an enemy's coordinates behind cover does not allow a projectile to pass through the bunker; the visibility state exists so evolution can learn to wait, flank or reposition rather than simply firing into solid cover.

## Scenarios

### Target Practice

Six moving targets, 16 matched physical creature starts per species, and three fresh random bunkers are generated each trial. The three species receive the exact same physical starts, while genotype-to-start assignment is shuffled independently.

Firing has the strongest missed-shot fitness cost. After a species hits a target, that target becomes unavailable to that species for two seconds, discouraging one-target farming and creating pressure to search and switch.

### Battlefield Run

Cross a randomly oriented square battlefield while hostile arrows travel perpendicular to the route. Agents cannot fire. Four fresh bunkers are generated from a canonical layout and rotated with the crossing direction, so up/right/down/left have equivalent geometry.

Arrow collisions have logical per-species hit state, so one colour cannot shield another.

### Invaders

A randomly oriented Space-Invaders-style defence with three fresh bunkers. Agents move on one axis, aim independently, shoot, dodge and use cover.

Every Invader has independent Red/Green/Blue logical state. Survival, hostile fire and breach failure are species-specific, so one species cannot steal another species' training targets or alter its threat layer.

### Battle Royale

Red vs Green vs Blue team combat. Team homes are equidistant and cover is freshly generated as two random three-way-symmetric bunker triplets. Friendly fire is impossible and living agents use physical separation so teams cannot collapse into one exact point.

A trial may run for up to **60 simulated seconds**. A genuine team wipe ends it immediately.

## Random cover safety

Scenario actors are placed before cover. Bunker placement rejects any rectangle that overlaps or comes too close to creatures, targets, Invaders or another bunker. CI generates 40 arenas of each mode — 160 total — and rejects any spawn/cover or cover/cover collision.

## Evolution fairness

- Every genotype is evaluated in four random trials before selection.
- Target Practice gives all colours the same sixteen physical starts.
- Battlefield and Invaders use equivalent spawn slots for every species.
- Practice colour offsets are render-only and do not alter physics coordinates.
- Directional scenarios use a square field with rotated-equivalent geometry.
- Battle Royale homes and cover are three-way symmetric.
- Initial network weights use fan-in scaling.
- Crossover preserves complete hidden-neuron subcircuits.
- Mutation frequency scales sub-linearly with genome size.
- The internal clock begins at a random phase each trial.

## Lifetime scoreboard

Visible performance is accumulated per scenario:

- Target Practice — total hits;
- Battlefield Run — total crossings;
- Invaders — total Invader kills;
- Battle Royale — career kills, deaths and raw K:D.

Battle Royale's LEADER calculation remains provisional until enough engagements exist and uses a lightly smoothed comparison so a single 1K/0D result does not dominate indefinitely.

Scenario changes while running are queued until the current four-trial generation is complete. Brains, generation and career records persist across scenario changes.

## Saving

BattlEvo uses IndexedDB for one persistent current evolution.

Pressing **Save** pauses and stores the species state: every Red/Green/Blue genome, hidden-neuron width, generation and completed career records. It does not save the current arena, creature positions or bullets. Reloading lets the player choose any scenario and continue the saved generation from Trial 1/4 on a fresh arena.

**RC5 and RC6 share the same 599-input / 18-output genome shape and save schema**, so RC5 species can continue into RC6. The meaning of visible objects and single-direction aim preferences remains compatible; RC6 simply supplies coordinates for occluded relevant objects and permits blended aim directions.

RC4 and older 77-input brains remain intentionally incompatible with the tactical-screen system. Reset Evolution deliberately erases the current save, career records and generation and returns to Gen 0 with editable hidden-neuron counts.

## Neural fairness

The initialisation audit feeds identical random input probes into 4N, 10N, 20N and 64N tactical brains.

Current output RMS:

- 4N: 0.4568
- 10N: 0.4681
- 20N: 0.4683
- 64N: 0.4601
- spread: 1.025×

Initial firing probability at the game's real `> 0.15` threshold:

- 4N: 34.5%
- 10N: 35.3%
- 20N: 37.6%
- 64N: 38.1%
- spread: 3.6 percentage points.

The larger 599-input first layer therefore still begins with comparable output scale across brain widths.

## RC5/RC6 stress telemetry

The deterministic 4N / 10N / 20N headless playtest completed three generations / twelve trials in every mode with finite state throughout.

Raw RC5 simulation throughput on the CI CPU was approximately:

- Target Practice: **1,355 ticks/s ≈ 22.6× real-time**;
- Battlefield Run: **2,041 ticks/s ≈ 34.0×**;
- Invaders: **1,077 ticks/s ≈ 18.0×**;
- Battle Royale: **1,900 ticks/s ≈ 31.7×**.

The deliberately worst-case **64N / 64N / 64N Battle Royale** sample managed about **292 ticks/s ≈ 4.9× real-time** before browser rendering. RC6 keeps the same network dimensions, so the dominant MLP cost is unchanged; additional line-of-sight flags are checked within the existing tactical table build. The UI reports requested versus achieved simulation speed rather than pretending 30× was reached.

## Performance

- each agent reuses one 599-value input buffer and its tactical-list arrays;
- the old 56-sector and 8-memory buffers no longer exist;
- Brain hidden/output buffers are reused;
- static arena scenery is cached to an offscreen Canvas;
- HUD updates are throttled;
- high-speed rendering is reduced;
- simulation gets an 8 ms real CPU budget per animation frame so an impossible speed target cannot monopolise the UI thread.

A Web Worker migration remains deferred until real iPhone/X220 testing shows main-thread responsiveness is still a practical problem.

## iPhone / Safari

- safe-area insets protect notch/home-indicator regions;
- native page scrolling and pinch zoom remain enabled;
- no mouse-only game controls;
- portrait crops decorative Canvas gutters so the 600×600 combat field uses the available width;
- landscape restores the wider observer view;
- running mode has sticky Pause / Save / speed controls;
- backgrounding explicitly pauses instead of attempting hidden-tab catch-up.

CI includes an interactive Playwright WebKit test covering start, invalid neuron correction, four-trial rollover, Save/reload/Continue, scenario choice after reload, pause overlay, background state, portrait/landscape layout and RC6's continuous aim calculation.

## Automated release audit

GitHub Actions checks:

- runtime/test JavaScript syntax;
- exact production script order;
- all four scenario loops and four-trial generation rollover;
- 60-second Battle Royale cap;
- 360° tactical awareness independent of aiming direction;
- occluded objects retaining coordinates with visibility = 0;
- visibility returning to 1 when cover is removed;
- physical bunker blocking of shots toward known hidden targets;
- continuous non-compass projectile aiming;
- static bunker knowledge;
- exact scenario friend/enemy/projectile filtering;
- absence of retired sector/memory vision functions and buffers;
- projectile/creature speed balance;
- Target anti-farming behaviour;
- matched Target starts and all-heading randomisation;
- 160-arena random-cover collision stress;
- Battlefield rotational fairness;
- independent Invader targets/fire/breach layers;
- Royale friendly-fire prevention and body separation;
- lifetime accounting;
- tactical save compatibility and rejection of old 77-input genomes;
- 4/10/20/64-neuron initialisation fairness;
- twelve-trial deterministic stress playtest;
- Chromium rendering and interactive WebKit mobile behaviour.

## Run locally

No runtime dependency or build step is required. Clone/download and open `index.html`, or run:

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000`.

GitHub Pages publishes directly from `main` / root; `.nojekyll` keeps the site static.

## Current version

**v1.0.0-rc.6 — known occluded coordinates, explicit visibility state and continuous 360° aiming.**