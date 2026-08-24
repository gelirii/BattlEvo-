# BattlEvo

BattlEvo is a dependency-free browser neural-evolution arcade. Three independently evolving species — **red, green and blue** — get the same senses, movement rules, projectile physics and evolutionary system. The player changes the hidden-neuron count for each species, chooses a scenario, and watches different brain sizes learn.

## Scenarios

- **Target Practice** — semi-regular moving targets, projectile travel time, aiming and leading. Targets never shoot back.
- **Battlefield Run** — cross a randomly oriented battlefield while arrows travel perpendicular to the route. Trains threat awareness, timing, dodging and remembered cover. Species do not fire in this mode.
- **Invaders** — randomly oriented Space-Invaders-style defence. Agents move on one axis, face independently, fire, dodge incoming shots and use bunkers. Only the front-most invader in each column can fire. Each logical alien has a separate Red/Green/Blue alive-state, so one species cannot steal another species' training target.
- **Battle Royale** — red vs green vs blue team combat. Agents recognise their own colour as friendly. Team homes are equidistant and rotate through equivalent map positions between generations.

The practice modes deliberately share sensory channels with Battle Royale: moving practice targets, invaders and enemy species all use the same hostile-tracking inputs, while arrows and incoming combat fire use the same projectile inputs. Switching scenarios keeps the evolved populations and generation; **Reset evolution** is the explicit full wipe.

## Agent rules

- The active combat field is a centred square. Rotating UP / RIGHT / DOWN / LEFT therefore changes direction without changing route length, dodge space or Invader breach distance.
- Full-field **180° forward vision**. Anything behind the creature is unseen until it turns.
- Bunkers block both sight and projectiles.
- Once a bunker has been seen, its location remains in that creature's 360° remembered terrain map for the rest of the episode.
- Eight facing directions and eight movement directions; facing and movement are independent.
- All creatures, moving targets and invaders use the same movement speed: **1.65 px/tick ≈ 99 px/s** at 60 simulation ticks/s.
- Every projectile uses the same speed: **4.6 px/tick ≈ 276 px/s**, about **2.79× creature speed**. It can catch a fleeing creature but remains visible and dodgeable.
- Species never interbreed.
- Neural networks have one hidden layer. The player chooses only the hidden-neuron count independently for red, green and blue.

## Evolution fairness

BattlEvo is intended to make brain-size comparisons meaningful rather than accidentally testing spawn luck or initialization bias.

- Genotypes are randomly assigned to physical spawn slots each generation so elite index 0 does not inherit a permanently favourable lane.
- Practice-mode species start in equivalent, visibly separate positions rather than different regions or exact visual stacks.
- Battlefield arrows can logically hit at most one creature of each colour, so one species cannot act as a physical shield for another in a training run.
- Invaders provide the same kill opportunities independently to all three species.
- All directional scenarios are rotated copies of the same square-field geometry.
- Battle Royale uses equidistant team homes and rotationally symmetric cover.
- Crossover preserves whole hidden-neuron subcircuits (incoming weights, bias and outgoing weights) instead of independently shredding every weight.
- Mutation frequency scales sub-linearly with genome size, while mutation amplitude scales with each parameter's own natural weight scale.
- Initial neural weights use fan-in normalization. A wider hidden layer therefore starts with essentially the same action-signal magnitude as a small one instead of becoming automatically “louder”.

## Physics audit

The automated gameplay audit currently measures:

- projectile / creature speed ratio: **2.788×**
- reaction time to a stationary shot first noticed 100 px away: **0.362 s**
- possible perpendicular movement in that time: **35.9 px** (over five creature radii)
- time for a projectile to catch a creature fleeing directly away from 100 px: **0.565 s**
- Invader hostile fire density in a deterministic 10-second sample: **27 shots**, or about **2.7 shots/s** across the formation
- Battlefield starting progress across all four rotations: **identical (0.0467)**
- Invader breach distance across all four rotations: **identical (412 px)**

These values are intended to make projectiles dangerous and visibly faster without turning dodging into luck.

## Neural fairness audit

A separate statistical test feeds identical sensory probes through many randomly initialized networks with different hidden widths. Current results:

- **4 neurons:** output RMS 0.4625; positive fire logit 48.9%
- **10 neurons:** output RMS 0.4643; positive fire logit 47.9%
- **20 neurons:** output RMS 0.4625; positive fire logit 50.1%
- **64 neurons:** output RMS 0.4664; positive fire logit 49.0%
- total output-RMS spread across 4→64 neurons: **1.009×**

This means different brain sizes begin with comparable signal strength and neutral action bias; the meaningful difference is available neural capacity and how evolution uses it.

## Run locally

No build step and no dependencies are required.

1. Clone or download the repository.
2. Open `index.html` in Firefox or Chromium.

For a tiny local web server instead:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

`.github/workflows/pages.yml` contains the official GitHub Pages static deployment workflow and publishes only the six browser game files. GitHub requires a one-time repository setting before the first deployment: **Settings → Pages → Source → GitHub Actions**. After that, every push to `main` deploys the game automatically.

## Automated audit

The GitHub Actions audit now includes:

- JavaScript syntax checks
- runtime smoke tests and complete generation rollover in all four scenarios
- 180° sight, bunker occlusion and remembered terrain
- projectile/creature speed balance
- rotational fairness for Battlefield and Invaders
- friendly-fire prevention
- independent Invader targets per species
- Battlefield anti-shielding behaviour
- Invader bullet-density limits
- scenario switching without resetting evolved brains
- statistical 4/10/20/64-neuron initialization fairness
- desktop **and phone** headless screenshots for visual review

Run the audits locally with:

```bash
node tests/smoke.js
node tests/audit.js
node tests/neural-fairness.js
```

## Current version

**v0.2.1** — gameplay, fairness, perception, UI/UX, performance, deployment and neural initialization audit.
