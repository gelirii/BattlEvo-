# BattlEvo

BattlEvo is a dependency-free browser neural-evolution arcade. Three independently evolving species — **red, green and blue** — get the same senses, movement rules, projectile physics and evolutionary system. The main player-controlled experimental variable is the number of hidden neurons in each species.

## Training grounds

- **Target Practice** — semi-regular moving targets, projectile travel time, aiming and leading. Targets never shoot back.
- **Battlefield Run** — cross a randomly oriented battlefield while arrows travel perpendicular to the route. Trains threat awareness, timing, dodging and remembered cover.
- **Invaders** — randomly oriented Space-Invaders-style defence. Agents move on one axis, can face independently, fire, dodge incoming shots and use bunkers.
- **Battle Royale** — red vs green vs blue team combat. Agents recognise their own colour as friendly and do not attack teammates.

The practice modes deliberately share sensory channels with Battle Royale: moving practice targets, invaders and enemy species all use the same hostile-tracking inputs, while arrows and incoming combat fire use the same projectile inputs. That means skills evolved in the practice modes can transfer into combat.

Once evolution has started, you can switch training grounds without resetting the populations. The current arena is discarded, but the evolved neural-network weights and generation are kept. **Reset** is the explicit full wipe.

## Agent rules

- 180° forward vision: direct sensory input stops behind the agent.
- Eight facing directions and eight movement directions; facing and movement are independent.
- Bunkers only enter memory after they have appeared in the forward field, then remain in a 360° remembered terrain map after the agent moves past or turns away from them.
- All creatures, moving targets and invaders use the same movement speed.
- All projectiles use the same projectile speed. Projectiles are faster than creatures, but remain visible and potentially dodgeable.
- Species never interbreed.
- Neural networks have one hidden layer. The player chooses the hidden-neuron count independently for red, green and blue.

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

**v0.1.0** — first playable evolutionary prototype.
