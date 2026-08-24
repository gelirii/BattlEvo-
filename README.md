# BattlEvo

BattlEvo is a dependency-free browser neural-evolution arcade. Three independently evolving species — red, green and blue — get the same senses, movement rules and evolutionary system. The player changes only the number of hidden neurons in each species and chooses the training ground.

## Training grounds

- **Target Practice** — moving targets, projectile travel time, aiming and leading. Targets never shoot back.
- **Battlefield Run** — cross a randomly oriented battlefield while perpendicular arrow fire teaches threat awareness, timing and cover use.
- **Invaders** — randomly oriented Space-Invaders-style defence. Agents move on one axis, can face independently, fire, dodge and use bunkers.
- **Battle Royale** — red vs green vs blue team combat. Agents recognise their own colour as friendly and do not attack teammates.

## Agent rules

- 180° forward vision.
- Eight facing directions and eight movement directions; facing and movement are independent.
- Bunkers seen once are retained in the agent's remembered terrain map even after they move behind it.
- All creatures and invaders use the same movement speed.
- All projectiles use the same projectile speed, which is faster than creatures but still visible and dodgeable.
- Species never interbreed.
- Neural networks have one hidden layer. The player only chooses the hidden-neuron count per species.

## Run it

No build step and no dependencies are required.

1. Clone or download the repository.
2. Open `index.html` in Firefox or Chromium.

For a tiny local web server instead:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The same files are suitable for GitHub Pages.

## Current version

v0.1 — first playable evolutionary prototype.
