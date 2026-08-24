'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// Reproducible pseudo-randomness makes failures repeatable in CI.
let seed = 0xB4771E0;
Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };

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
    return elements[id] || { value: '', disabled: false, textContent: '', classList:{toggle(){},remove(){}} };
  }
};
global.performance = { now: () => 0 };
global.setRunningUI = () => {};
global.updateHud = () => {};

for (const file of ['core.js', 'brain-world.js', 'modes.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

function evaluate(code) { return vm.runInThisContext(code); }
function init(mode){ evaluate(`selectedMode='${mode}'; initSimulation();`); }
function positionsUnique(){
  const pts=evaluate('sim.agents.map(a=>`${a.x.toFixed(3)},${a.y.toFixed(3)}`)');
  return new Set(pts).size===pts.length;
}

assert.strictEqual(evaluate('INPUTS'), 77, 'sensory input count should match the shared layout');
assert.strictEqual(evaluate('OUTPUTS'), 18, 'action output count changed unexpectedly');
assert.ok(evaluate('SIGHT_RANGE >= Math.hypot(W,H)'), 'forward sight should cover the whole arena');

const speedRatio=evaluate('PROJECTILE_SPEED/AGENT_SPEED');
assert.ok(speedRatio>=2.6&&speedRatio<=3.0, `projectile/creature speed ratio ${speedRatio.toFixed(2)} left the intended dodgeable window`);
const catchSeconds=evaluate('200/(PROJECTILE_SPEED-AGENT_SPEED)/60');
const dodgeAt100=evaluate('(100/PROJECTILE_SPEED)*AGENT_SPEED');
assert.ok(catchSeconds<1.5&&catchSeconds>.8, 'a projectile should catch a fleeing creature from 200px in about a second');
assert.ok(dodgeAt100>evaluate('AGENT_R*3'), 'a creature reacting at 100px should have room for a meaningful perpendicular dodge');
console.log(`Physics: creature ${(evaluate('AGENT_SPEED')*60).toFixed(0)} px/s, projectile ${(evaluate('PROJECTILE_SPEED')*60).toFixed(0)} px/s, ratio ${speedRatio.toFixed(2)}x, 200px fleeing catch ${catchSeconds.toFixed(2)}s.`);

// Basic boot/runtime checks with the real default 4/10/20-neuron comparison.
for (const mode of ['target', 'battlefield', 'invaders', 'royale']) {
  init(mode);
  assert.strictEqual(evaluate('sim.mode'), mode);
  assert.strictEqual(evaluate('sim.agents.length'), 36, `${mode}: expected 12 agents per species`);
  assert.strictEqual(evaluate('buildInputs(sim.agents[0]).length'), 77, `${mode}: sensory vector length mismatch`);
  assert.ok(positionsUnique(), `${mode}: agents should be visually separable instead of exactly stacked`);
  for (let i = 0; i < 180; i++) evaluate('step();');
  assert.ok(evaluate('sim && sim.generation >= 1'), `${mode}: simulation stopped unexpectedly`);
}

// Changing scenario must keep the actual Brain object/population rather than silently resetting evolution.
init('target');
const before = evaluate('sim.populations.red[0].brain');
evaluate("sim.mode='battlefield'; setupGeneration();");
const after = evaluate('sim.populations.red[0].brain');
assert.strictEqual(before, after, 'switching scenarios should preserve the population');

// Direct sight is 180°, bunkers occlude enemies, but a seen bunker remains in memory after turning away.
init('target');
evaluate(`
  const testA=sim.agents[0];
  testA.x=100;testA.y=300;testA.facing=0;testA.memory.clear();
  sim.bunkers=[newBunker(180,280,40,40,'LOS')];
  sim.targets=[{x:300,y:300,dx:1,dy:0,speed:AGENT_SPEED,r:9,id:99,hitFlash:0}];
  sim.projectiles=[];sim.arrows=[];
`);
let input=evaluate('buildInputs(testA)');
const centreEnemyIndex=9+3*8;
assert.strictEqual(input[centreEnemyIndex],0,'a target directly behind a bunker should be visually occluded');
assert.ok(evaluate("testA.memory.has('LOS')"),'a visible bunker should enter terrain memory');
evaluate('testA.facing=4');
input=evaluate('buildInputs(testA)');
const memoryEnergy=Array.from(input.slice(65,73)).reduce((a,b)=>a+b,0);
assert.ok(memoryEnergy>0,'remembered cover should remain available after the bunker moves behind the agent');

evaluate('testA.facing=0;sim.bunkers=[]');
input=evaluate('buildInputs(testA)');
assert.ok(input[centreEnemyIndex]>0,'removing the bunker should reveal the target');

// Far objects in the forward half still register; "see everything in front" is not secretly a 700px cutoff.
evaluate('testA.x=20;testA.y=300;testA.facing=0;sim.targets=[{x:940,y:300,dx:0,dy:0,speed:AGENT_SPEED,r:9,id:98,hitFlash:0}]');
input=evaluate('buildInputs(testA)');
assert.ok(input[centreEnemyIndex]>0,'a far forward target should still be sensed');

// A diagonal target reports actual component velocity, not sqrt(2) too much speed.
evaluate('testA.x=100;testA.y=100;testA.facing=1;testA.memory.clear();sim.targets=[{x:300,y:300,dx:1,dy:1,speed:AGENT_SPEED,r:9,id:97,hitFlash:0}];sim.bunkers=[]');
input=evaluate('buildInputs(testA)');
assert.ok(Math.abs(input[centreEnemyIndex+1]-Math.SQRT1_2)<.02,'diagonal target x velocity sensor should be normalized');
assert.ok(Math.abs(input[centreEnemyIndex+2]-Math.SQRT1_2)<.02,'diagonal target y velocity sensor should be normalized');

// Battlefield is movement/threat training: firing output must not create useless bullets or fitness penalties.
init('battlefield');
evaluate(`for(const a of sim.agents){a.genotype.brain.run=()=>{const o=new Float32Array(18);o[0]=1;o[9]=1;o[17]=10;return o;};}`);
for(let i=0;i<5;i++)evaluate('stepAgents();');
assert.strictEqual(evaluate('sim.projectiles.length'),0,'Battlefield should not emit species projectiles');
assert.strictEqual(evaluate('sim.agents.reduce((n,a)=>n+a.shots,0)'),0,'Battlefield should not count phantom shots');

// Only the front-most living invader in each of seven columns may fire at once.
init('invaders');
evaluate('for(const n of sim.invaders)n.fireClock=0;sim.projectiles=[];stepInvaders();');
const volley=evaluate("sim.projectiles.filter(p=>p.team==='invader').length");
assert.ok(volley>0&&volley<=7,`Invaders opening volley should be 1..7 shots, got ${volley}`);

// Actual target and invader displacement never exceeds creature speed.
init('target');
let tx=evaluate('sim.targets[2].x'),ty=evaluate('sim.targets[2].y');
evaluate('stepTargets();');
let dx=evaluate('sim.targets[2].x')-tx,dy=evaluate('sim.targets[2].y')-ty;
assert.ok(Math.hypot(dx,dy)<=evaluate('AGENT_SPEED')+1e-6,'target exceeded creature speed');
init('invaders');
let ix=evaluate('sim.invaders[0].x'),iy=evaluate('sim.invaders[0].y');
evaluate('stepInvaders();');
dx=evaluate('sim.invaders[0].x')-ix;dy=evaluate('sim.invaders[0].y')-iy;
assert.ok(Math.hypot(dx,dy)<=evaluate('AGENT_SPEED')+1e-6,'invader exceeded creature speed');

// Battle Royale team centroids must form an effectively equilateral triangle at spawn.
init('royale');
const centroids=evaluate(`SPECIES.map(s=>{const a=sim.agents.filter(x=>x.species.id===s.id);return{x:a.reduce((n,x)=>n+x.x,0)/a.length,y:a.reduce((n,x)=>n+x.y,0)/a.length};})`);
const pd=[];for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)pd.push(Math.hypot(centroids[i].x-centroids[j].x,centroids[i].y-centroids[j].y));
assert.ok(Math.max(...pd)-Math.min(...pd)<1,'Royale team homes should be equidistant');

// Run a complete generation in every mode with tiny brains: catches end-of-round/evolution bugs
// without making CI spend most of its time doing neural matrix multiplies.
elements['brain-red'].value=elements['brain-green'].value=elements['brain-blue'].value='2';
for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);let guard=0;while(evaluate('sim.generation')===1&&guard<2600){evaluate('step();');guard++;}
  assert.strictEqual(evaluate('sim.generation'),2,`${mode}: first generation never completed/evolved`);
  assert.ok(typeof evaluate('sim.lastSummary')==='string'&&evaluate('sim.lastSummary.length')>5,`${mode}: round summary missing`);
  console.log(`${mode}: first generation completed in ${guard} ticks — ${evaluate('sim.lastSummary')}`);
}

// Static UI sanity: every literal getElementById used by ui.js must exist in index.html.
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('ui.js','utf8');
for(const match of ui.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes(`id="${match[1]}"`),`UI references missing #${match[1]}`);
for(const file of ['core.js','brain-world.js','modes.js','ui.js','style.css'])assert.ok(fs.existsSync(file),`missing browser asset ${file}`);

console.log('BattlEvo gameplay audit passed.');
