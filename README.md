# BattlEvo

BattlEvo is a dependency-free browser neural-evolution arcade. Three independently evolving species — **red, green and blue** — get the same senses, movement rules, projectile physics and evolutionary system. The player changes the hidden-neuron count for each species, chooses a scenario, and watches different brain sizes learn.

## Scenarios

- **Target Practice** — semi-regular moving targets, projectile travel time, aiming and leading. Targets never shoot back.
- **Battlefield Run** — cross a randomly oriented battlefield while arrows travel perpendicular to the route. Trains threat awareness, timing, dodging and remembered cover. Species do not fire in this mode.
- **Invaders** — randomly oriented Space-Invaders-style defence. Agents move on one axis, face independently, fire, dodge incoming shots and use bunkers. Only the front-most invader in each column can fire.
- **Battle Royale** — red vs green vs blue team combat. Agents recognise their own colour as friendly. Team homes are equidistant and rotate through equivalent map positions between generations.

The practice modes deliberately share sensory channels with Battle Royale: moving practice targets, invaders and enemy species all use the same hostile-tracking inputs, while arrows and incoming combat fire use the same projectile inputs. Switching scenarios keeps the evolved populations and generation; **Reset evolution** is the explicit full wipe.

## Agent rules

- Full-arena **180° forward vision**. Anything behind the creature is unseen until it turns.
- Bunkers block both sight and projectiles.
- Once a bunker has been seen, its location remains in that creature's 360° remembered terrain map for the rest of the episode.
- Eight facing directions and eight movement directions; facing and movement are independent.
- All creatures, moving targets and invaders use the same movement speed: **1.65 px/tick ≈ 99 px/s** at 60 simulation ticks/s.
- Every projectile uses the same speed: **4.6 px/tick ≈ 276 px/s**, about **2.79× creature speed**. It can catch a fleeing creature but remains visible and dodgeable.
- Species never interbreed.
- Neural networks have one hidden layer. The player chooses only the hidden-neuron count independently for red, green and blue.

## Evolution fairness

BattlEvo is intended to make brain-size comparisons meaningful rather than accidentally testing spawn luck.

- Genotypes are randomly assigned to physical spawn slots each generation so elite index 0 does not inherit a permanently favourable lane.
- Practice-mode species start in equivalent side-by-side positions rather than different regions or exact visual stacks.
- Battle Royale uses equidistant team homes and rotationally symmetric cover.
- Crossover preserves whole hidden-neuron subcircuits (incoming weights, bias and outgoing weights) instead of independently shredding every weight.
- Mutation load scales sub-linearly with genome size, so larger brains explore more parameters without receiving hundreds of extra mutations simply because they contain more weights.

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

`.github/workflows/pages.yml` contains the official GitHub Pages static deployment workflow. GitHub requires a one-time repository setting before the first deployment: **Settings → Pages → Source → GitHub Actions**. After that, every push to `main` deploys the game automatically.

## Automated audit

The GitHub Actions gameplay audit syntax-checks the JavaScript and runs headless tests covering all four scenarios, full generation rollover, 180° sight, bunker occlusion and memory, projectile/creature speed balance, target velocity sensing, spawn separation/fairness, Invader firing limits and scenario continuity. A separate CI job captures a desktop UI screenshot for visual review.

Run the gameplay audit locally with:

```bash
node tests/smoke.js
```

## Current version

**v0.2.0** — gameplay, fairness, perception, UI/UX and performance audit.
