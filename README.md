# BattlEvo

BattlEvo is a dependency-free browser neural-evolution arcade. Three independently evolving species — **red, green and blue** — receive the same senses, movement rules, projectile physics and evolutionary system. The player changes only the hidden-neuron count for each species, chooses a scenario, and watches different brain sizes learn.

The runtime is plain HTML/CSS/JavaScript and Canvas. There is no build step and no runtime library dependency.

## v1 RC3 rules

- **Hidden neurons:** 1–64 per species. Inputs are validated and the visible controls always show the brain size actually in use.
- **Network:** 77 inputs → one user-sized hidden layer → 18 outputs.
- **Population:** **16 creatures per species / 48 total**.
- **Evaluation:** every genotype is tested across **four independently randomised trials per generation**. Fitness is averaged across all four trials before breeding.
- **Creature, target and Invader speed:** **1.65 px/tick ≈ 99 px/s** at 60 simulation ticks/s.
- **Projectile speed:** **4.6 px/tick ≈ 276 px/s**, or **2.788× creature speed**.
- **Sight:** the complete 180° forward half-plane within the combat field. Bunkers occlude sight.
- **Memory:** once a bunker is seen, its location remains in that creature's 360° remembered terrain map for that episode.
- **Facing and movement are independent**, each using eight compass directions; movement can also remain still.
- Species never interbreed.

A genetic **generation** contains four actual game rounds. Lifetime scoreboards count every real round, while natural selection waits until all four evaluation trials have completed.

## Scenarios

### Target Practice

Creatures, bunkers and moving targets are regenerated across the whole square arena. Six targets begin with six distinct directions sampled from the eight compass headings. All three species receive the **same sixteen physical starting positions and facings**, while genotypes are assigned to those starts independently.

Targets never fire back. Firing has a meaningful fitness cost, and after a species hits a target that target becomes unavailable to that species for two seconds. This prevents repeatedly farming one conveniently placed target and creates pressure to search, switch targets and fire selectively.

### Battlefield Run

Cross a randomly oriented battlefield while arrows travel perpendicular to the route. Species do not fire in this mode. Cover is selected from multiple equivalent layout templates, arrow lanes are jittered, and firing intervals vary rather than following one perfectly predictable global rhythm.

Battlefield projectiles use logical per-colour hit state so one species cannot physically shield another from the same training hazard.

### Invaders

A randomly oriented Space-Invaders-style defence. Agents move on one axis, face independently, shoot, dodge incoming fire and use bunkers.

Every Invader has separate Red/Green/Blue logical state. Target survival, front-column firing, hostile projectiles and breach/failure are all independent per species. Red destroying an Invader therefore cannot steal Green's target, and an Invader Red has already destroyed cannot later shoot or cause a breach failure for Red.

### Battle Royale

Red vs Green vs Blue team combat. Creatures recognise their own colour as friendly, cannot damage teammates and use equidistant team homes with rotationally symmetric cover. Living creatures also have simple physical separation so opposing teams cannot collapse into the exact same point.

RC3 extends the maximum Battle Royale round from **35 seconds to 60 seconds**. A genuine team wipe still ends the trial immediately; the extra time exists only to give unresolved fights more opportunity to reach an outright winner naturally.

## Shared combat vocabulary

Practice modes deliberately use the same sensory concepts as Battle Royale:

- moving practice targets, Invaders and hostile species all use the hostile-object channels;
- battlefield arrows, Invader fire and Battle Royale projectiles all use incoming-projectile channels;
- velocity is encoded **relative to the creature's current facing** as forward/back and left/right components rather than absolute screen X/Y velocity;
- cover visibility and remembered cover use the same channels across scenarios.

This makes rotated arenas equivalent and avoids forcing a small brain to reconstruct screen coordinates merely to understand an incoming object.

## Lifetime scoreboard

Generation fitness remains internal to natural selection, but the visible leaderboard is based on accumulated scenario performance:

- **Target Practice:** total hits
- **Battlefield Run:** total successful crossings
- **Invaders:** total Invader kills
- **Battle Royale:** raw career K:D with kills and deaths shown

Battle Royale's **LEADER** badge does not let a one-kill/zero-death sample win forever. It remains provisional until ten recorded kill/death engagements and uses a lightly smoothed ratio for leader comparison while still displaying the raw K:D to the player.

Each scenario also records how many completed rounds contributed to its totals. Four rounds normally correspond to one completed genetic generation.

## Scenario switching

Changing scenario while evolution is running **queues the new scenario for the next generation**. All four evaluation trials of the current generation finish normally before switching, avoiding accidental abandonment or arena rerolling.

Brains, generation number and all four lifetime scoreboards persist across scenario changes.

## Persistent species-state saving

BattlEvo uses **IndexedDB** for one persistent current evolution.

The saved object is the **species/evolution state**, not the current battle. A save stores:

- all Red/Green/Blue genomes;
- hidden-neuron widths;
- generation number;
- completed lifetime records and per-mode round counts.

It deliberately does **not** store creature positions, projectiles, bunker positions, current target movement, current trial number or partial trial fitness.

Pressing **Save** pauses the game and writes this state immediately. After a refresh, browser restart or later return, the opening screen shows the saved neuron widths locked and a **Continue Gen N** button. The player can choose Target Practice, Battlefield Run, Invaders or Battle Royale before continuing. The saved generation then starts at **Trial 1/4 on a fresh arena** using the preserved brains.

If Save is pressed halfway through a trial, partial career events from that unfinished trial are rolled back to the trial-start baseline. Completed rounds remain in the career totals. Trial-evaluation fitness is intentionally discarded so a half-finished Royale trial cannot influence breeding after the species resume in a completely different scenario.

Automatic safety checkpoints also remain after completed trials/generations and when the page backgrounds. They use the same species-state format, so ordinary recovery does not depend solely on iOS giving a disappearing page enough time to finish an emergency write.

If a saved evolution exists, hidden-neuron controls stay locked and **Start New Evolution** is unavailable. **Reset Evolution** is the deliberate action that erases the saved brains, career records and generation and returns BattlEvo to Gen 0 with editable neuron counts.

RC3 remains backward-compatible with RC1/RC2 saves. Older 12-creature populations are expanded to 16 while preserving the original evolved genomes; old mid-trial fitness is discarded under the new clean species-state semantics.

## Evolution fairness

BattlEvo attempts to make brain-size comparisons meaningful instead of accidentally testing one lucky arena, spawn luck, width-dependent signal strength or coordinate-system reconstruction.

- Every genotype is evaluated in **four separate randomised trials** before selection, and its fitness is averaged across them.
- Target Practice gives all colours the same sixteen physical starts each trial.
- Battlefield and Invaders give all species the same set of spawn slots; genotype-to-slot assignment is shuffled independently.
- Practice colours are visually displaced only during rendering, not in simulation physics.
- All directional scenarios use the same square combat field and rotated-equivalent geometry.
- Battle Royale homes are equidistant and rotate through equivalent positions.
- Initial network weights use fan-in scaling.
- Crossover preserves complete hidden-neuron subcircuits: incoming connections, hidden bias and outgoing connections travel together.
- Mutation frequency scales sub-linearly with genome size, reducing the old penalty where a wider brain was genetically scrambled simply because it contained more weights.
- The internal sine/cosine clock starts with a random phase each trial.

## Firing balance

Projectile physics remain deliberately unchanged:

- projectile / creature speed ratio: **2.788×**
- arrival time for a projectile 100 px away from a stationary target: **0.362 s**
- possible perpendicular movement during that warning: **35.9 px**, over five creature radii
- catch time for a projectile starting 100 px behind a creature fleeing directly away: **0.565 s**
- Battlefield starting progress across all four rotations: **0.0467 in every direction**
- deterministic Invader hostile fire sample: about **27 shots / 10 s per species layer** in RC3 CI

The intended result is that bullets cannot simply be outrun, close shots are dangerous, and an early-seen trajectory can still be dodged.

Firing itself is not free. Target Practice has the strongest missed-shot cost, with smaller costs in Invaders and Battle Royale so evolution has a reason to develop selective shooting rather than permanent spray-and-pray behaviour.

## Neural fairness audit

The statistical initialization audit feeds identical sensory probes into random 4N, 10N, 20N and 64N brains.

Current output RMS:

- **4N:** 0.4625
- **10N:** 0.4643
- **20N:** 0.4625
- **64N:** 0.4664
- total RMS spread: **1.009×**

Using the game's real FIRE threshold of `> 0.15`, initial firing rates are:

- **4N:** 35.4%
- **10N:** 36.6%
- **20N:** 38.6%
- **64N:** 37.2%
- spread: **3.2 percentage points**

Wider brains therefore do not begin with materially stronger action signals or a radically different chance of firing.

## RC3 stress telemetry

The deterministic CI stress run completed three genetic generations — **twelve trials** — in every scenario using the 16×3 population and four-trial evaluation model.

Final lifetime totals in that synthetic run were:

- Target Practice: **432 / 441 / 370 hits**
- Battlefield Run: **12 / 10 / 13 crossings**
- Invaders: **174 / 190 / 181 kills**
- Battle Royale: **R 155K/142D, G 107K/165D, B 163K/118D**

All twelve early-generation Battle Royale trials reached the new 60-second cap in this deterministic test. Those synthetic brains are deliberately immature; the result confirms the longer timeout is being exercised rather than implying an evolved lineage cannot win earlier.

The deliberately worst-case all-64N Battle Royale sample, with 48 agents, achieved about **845 simulation ticks/s = 14.1× real-time** on the headless CI CPU before browser-rendering overhead. This is telemetry, not a promise for an iPhone or X220. It is why 30× remains a requested target and may show **CPU limited** on demanding configurations.

## Performance work

The release candidate reduces main-thread pressure substantially:

- neural hidden/output arrays are reused instead of allocated every brain evaluation;
- each agent reuses its 77-input, 56-sector and 8-memory sensory buffers;
- helper functions avoid a fresh family of closures for every sensory pass;
- static arena scenery is cached to an offscreen Canvas;
- HUD DOM updates are throttled instead of rewritten every animation frame;
- at high simulation speeds rendering is reduced while simulation continues;
- simulation uses an **8 ms real CPU budget per animation frame**, so 30× is a target rather than permission to freeze the UI for 90 expensive ticks;
- the UI reports requested vs achieved simulation speed and marks the run **CPU limited** when the device cannot sustain the selected multiplier.

A Web Worker migration remains deliberately deferred until physical iPhone/X220 stress testing shows that main-thread responsiveness is still a practical problem. Moving the simulation into a Worker adds architectural complexity and should solve a measured problem rather than an assumed one.

## iPhone / Safari

The mobile design explicitly accounts for Safari:

- `viewport-fit=cover` is paired with `env(safe-area-inset-*)` padding for notch and home-indicator areas;
- native page scrolling and pinch zoom remain enabled;
- buttons use normal click semantics rather than mouse-only handlers;
- on portrait phones the decorative Canvas gutters are cropped so the **600×600 combat field uses the full available width**;
- landscape restores the full widescreen observation view;
- running mode has a sticky **Pause + Save + speed** bar above the arena;
- Pause has a clear visual overlay;
- backgrounding explicitly pauses and resets timing on return instead of generating a catch-up burst.

CI includes a real **Playwright WebKit** interaction test. RC3 verifies that Save pauses the game, persists the saved generation through IndexedDB, reloads into the locked saved-evolution screen, allows a different scenario to be selected, restores the same generation at Trial 1/4, preserves neuron widths, and keeps the existing pause/background/orientation checks.

A final physical iPhone Safari/X220 stress test is still recommended before removing the release-candidate suffix because headless WebKit cannot reproduce every device-level behaviour or thermal/performance limit.

## Run locally

No runtime dependency or build step is required.

1. Clone or download the repository.
2. Open `index.html` directly, or run:

```bash
python3 -m http.server 8000
```

and open `http://localhost:8000`.

## GitHub Pages

The repository publishes directly from **`main` / root**. `.nojekyll` keeps it as a plain static Pages site.

## Automated release audit

GitHub Actions runs:

- syntax checks for every runtime and test file;
- the exact production script order;
- complete **four-trial** generation rollover in all four scenarios;
- the **60-second** Battle Royale cap;
- 180° sight, bunker occlusion and remembered terrain;
- facing-relative velocity sensing;
- projectile/creature speed balance;
- Target shot cost and anti-farming cooldown;
- matched 16-agent Target Practice starts plus all-quadrant/all-heading randomisation;
- Battlefield rotational fairness, timing and anti-shielding;
- independent Invader targets, hostile fire and breach layers;
- Battle Royale friendly-fire prevention and body separation;
- lifetime hit/cross/kill/K:D accounting;
- RC1/RC2 → RC3 save migration and clean species-state restoration;
- 4/10/20/64-neuron initialization fairness at the actual firing threshold;
- a three-generation/twelve-trial deterministic RC3 stress playtest;
- Chromium desktop rendering;
- interactive WebKit mobile/landscape behaviour, manual saving, scenario selection after reload, persistence and pause-overlay state.

Core Node audits can be run locally with:

```bash
node tests/smoke.js
node tests/audit.js
node tests/neural-fairness.js
node tests/target-randomization.js
node tests/lifetime-scoreboard.js
node tests/save-migration.js
node tests/long-run.js
```

The WebKit test additionally requires Playwright and is intended primarily for CI.

## Current version

**v1.0.0-rc.3** — persistent species-state saves, simple Continue/Reset recovery flow, four-trial genotype evaluation and 60-second Battle Royale rounds.