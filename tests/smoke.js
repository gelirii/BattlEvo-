'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const fakeCtx = new Proxy({}, {
  get(target, prop) {
    if (!(prop in target)) target[prop] = () => {};
    return target[prop];
  },
  set(target, prop, value) { target[prop] = value; return true; }
});

const elements = {
  game: { width: 960, height: 600, getContext: () => fakeCtx },
  'brain-red': { value: '4' },
  'brain-green': { value: '10' },
  'brain-blue': { value: '20' },
};

global.document = {
  getElementById(id) {
    return elements[id] || { value: '', disabled: false, textContent: '' };
  }
};
global.performance = { now: () => 0 };
global.setRunningUI = () => {};
global.updateHud = () => {};

for (const file of ['core.js', 'brain-world.js', 'modes.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

function evaluate(code) {
  return vm.runInThisContext(code);
}

assert.strictEqual(evaluate('INPUTS'), 77, 'sensory input count should match the shared layout');
assert.ok(evaluate('PROJECTILE_SPEED > AGENT_SPEED'), 'projectiles must outrun creatures');

for (const mode of ['target', 'battlefield', 'invaders', 'royale']) {
  evaluate(`selectedMode='${mode}'; initSimulation();`);
  assert.strictEqual(evaluate('sim.mode'), mode);
  assert.strictEqual(evaluate('sim.agents.length'), 36, `${mode}: expected 12 agents per species`);
  assert.strictEqual(evaluate('buildInputs(sim.agents[0]).length'), 77, `${mode}: sensory vector length mismatch`);
  for (let i = 0; i < 180; i++) evaluate('step();');
  assert.ok(evaluate('sim && sim.generation >= 1'), `${mode}: simulation stopped unexpectedly`);
}

// Changing training ground must keep evolved populations instead of rebuilding brains.
evaluate("selectedMode='target'; initSimulation();");
const before = evaluate('sim.populations.red[0].brain');
evaluate("sim.mode='battlefield'; setupGeneration();");
const after = evaluate('sim.populations.red[0].brain');
assert.strictEqual(before, after, 'switching training grounds should preserve the population');

// Actual target and invader movement may change direction, but never exceed the shared creature speed.
evaluate("selectedMode='target'; initSimulation();");
let tx = evaluate('sim.targets[2].x'), ty = evaluate('sim.targets[2].y');
evaluate('stepTargets();');
let dx = evaluate('sim.targets[2].x') - tx, dy = evaluate('sim.targets[2].y') - ty;
assert.ok(Math.hypot(dx, dy) <= evaluate('AGENT_SPEED') + 1e-6, 'target exceeded creature speed');

evaluate("selectedMode='invaders'; initSimulation();");
let ix = evaluate('sim.invaders[0].x'), iy = evaluate('sim.invaders[0].y');
evaluate('stepInvaders();');
dx = evaluate('sim.invaders[0].x') - ix; dy = evaluate('sim.invaders[0].y') - iy;
assert.ok(Math.hypot(dx, dy) <= evaluate('AGENT_SPEED') + 1e-6, 'invader exceeded creature speed');

console.log('BattlEvo smoke test passed.');
