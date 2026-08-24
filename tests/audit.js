'use strict';

const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

let seed=0xBADD1E;
const originalRandom=Math.random;
Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};

const fakeCtx=new Proxy({}, {
  get(target,prop){if(!(prop in target))target[prop]=()=>{};return target[prop];},
  set(target,prop,value){target[prop]=value;return true;}
});
const elements={
  game:{width:960,height:600,getContext:()=>fakeCtx},
  'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}
};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};
global.performance={now:()=>0};
global.setRunningUI=()=>{};
global.updateHud=()=>{};
global.updateRoundResult=()=>{};

for(const file of ['core.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);
const approx=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol;
const resetMode=mode=>ev(`selectedMode='${mode}';initSimulation();`);

// Physics balance: fast enough to catch a fleeing unit, slow enough to dodge visually.
const agentSpeed=ev('AGENT_SPEED'),projectileSpeed=ev('PROJECTILE_SPEED'),ratio=projectileSpeed/agentSpeed;
assert.ok(ratio>2.5&&ratio<3.2,`projectile/agent ratio ${ratio.toFixed(2)} outside intended 2.5–3.2 window`);
assert.ok(projectileSpeed>agentSpeed,'projectiles must catch a directly fleeing creature');
const reaction100Ticks=100/projectileSpeed;
const lateral100=reaction100Ticks*agentSpeed;
assert.ok(lateral100>3*ev('AGENT_R'),`100px warning only permits ${lateral100.toFixed(1)}px lateral dodge`);
const fleeingCatch100=100/(projectileSpeed-agentSpeed);
assert.ok(fleeingCatch100<60,'a projectile should catch a creature fleeing from 100px within one second');

assert.strictEqual(ev('FIELD.size'),ev('H'),'active combat field must be square');
assert.strictEqual(ev('INPUTS'),77,'sensory vector contract changed unexpectedly');

// All four rotated Battlefield starts must begin at the same progress.
resetMode('battlefield');
const starts=[];
for(let o=0;o<4;o++){
  ev(`sim.orientation=${o};sim.agents=[];sim.bunkers=[];setupBattlefield();`);
  starts.push(ev('objectiveVector(sim.agents[0]).progress'));
  assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'),`Battlefield orientation ${o}: spawn outside field`);
  assert.ok(ev('sim.bunkers.every(b=>inArenaPoint({x:b.x,y:b.y})&&inArenaPoint({x:b.x+b.w,y:b.y+b.h}))'),`Battlefield orientation ${o}: bunker outside field`);
}
assert.ok(Math.max(...starts)-Math.min(...starts)<1e-6,'Battlefield orientations have unequal starting progress');

// Invader front row has identical breach distance in every orientation.
resetMode('invaders');
const breachDistances=[];
for(let o=0;o<4;o++){
  ev(`sim.orientation=${o};sim.agents=[];sim.bunkers=[];sim.invaders=[];setupInvaders();`);
  const d=ev(`(()=>{const front=sim.invaders.filter(n=>n.row===2);if(${o}===0)return FIELD.bottom-28-Math.max(...front.map(n=>n.y));if(${o}===2)return Math.min(...front.map(n=>n.y))-(FIELD.top+28);if(${o}===1)return Math.min(...front.map(n=>n.x))-(FIELD.left+28);return FIELD.right-28-Math.max(...front.map(n=>n.x));})()`);
  breachDistances.push(d);
}
assert.ok(Math.max(...breachDistances)-Math.min(...breachDistances)<1e-6,`Invader breach distances differ: ${breachDistances.join(', ')}`);

// Bunkers genuinely occlude direct sight, then remain remembered after turning away.
resetMode('target');
ev(`sim.bunkers=[newBunker(300,275,60,50,'LOS')];`);
ev(`sim.agents[0].x=240;sim.agents[0].y=300;sim.agents[0].facing=0;sim.agents[0].memory.clear();`);
assert.strictEqual(ev('lineOfSight(sim.agents[0],{x:420,y:300})'),false,'bunker should hide an object directly behind it');
assert.strictEqual(ev('lineOfSight(sim.agents[0],{x:320,y:170})'),true,'bunker should not hide a clear off-axis object');
ev('rememberVisibleBunkers(sim.agents[0]);');
assert.strictEqual(ev("sim.agents[0].memory.has('LOS')"),true,'visible bunker was not memorised');
ev('sim.agents[0].facing=4;rememberVisibleBunkers(sim.agents[0]);');
assert.strictEqual(ev("sim.agents[0].memory.has('LOS')"),true,'remembered bunker vanished after turning away');

// Battlefield Run must not produce useless species gunfire even with fire output forced high.
resetMode('battlefield');
ev(`sim.projectiles=[];for(const a of sim.agents)a.genotype.brain.run=()=>{const o=new Float32Array(18);o[17]=1;return o;};stepAgents();`);
assert.strictEqual(ev('sim.projectiles.length'),0,'Battlefield firing output should be ignored');

// Friendly fire is impossible in Battle Royale, hostile fire still works.
resetMode('royale');
ev(`(()=>{const red=SPECIES[0],blue=SPECIES[2],g=sim.populations.red[0];const shooter=new Agent(red,g,0,300,300,0);const friend=new Agent(red,g,1,400,300,4);const enemy=new Agent(blue,sim.populations.blue[0],0,450,300,4);sim.agents=[shooter,friend,enemy];sim.bunkers=[];sim.projectiles=[{x:400-PROJECTILE_SPEED,y:300,vx:PROJECTILE_SPEED,vy:0,owner:shooter,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);
assert.strictEqual(ev('sim.agents[1].health'),1,'friendly projectile damaged teammate');
ev(`sim.projectiles=[{x:450-PROJECTILE_SPEED,y:300,vx:PROJECTILE_SPEED,vy:0,owner:sim.agents[0],team:'red',r:2.5,dead:false}];stepProjectiles();`);
assert.ok(ev('sim.agents[2].health')<1,'hostile projectile failed to damage enemy');

// One colour killing an Invader must not steal that target from the other colours.
resetMode('invaders');
ev(`(()=>{const n=sim.invaders[0];n.x=FIELD.cx;n.y=FIELD.cy;sim.bunkers=[];const red=sim.agents.find(a=>a.species.id==='red');red.x=n.x-30;red.y=n.y;sim.projectiles=[{x:n.x-PROJECTILE_SPEED,y:n.y,vx:PROJECTILE_SPEED,vy:0,owner:red,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);
assert.strictEqual(ev('sim.invaders[0].aliveFor.red'),false,'Red did not clear its own copy of Invader');
assert.strictEqual(ev('sim.invaders[0].aliveFor.green'),true,'Red stole Green’s Invader target');
assert.strictEqual(ev('sim.invaders[0].aliveFor.blue'),true,'Red stole Blue’s Invader target');
assert.strictEqual(ev('sim.invaders[0].alive'),true,'logical Invader disappeared before all colours cleared it');

// Battlefield projectiles may hit one creature of each colour; one colour cannot shield another.
resetMode('battlefield');
ev(`(()=>{sim.bunkers=[];sim.tick=1;const gR=sim.populations.red[0],gG=sim.populations.green[0],gB=sim.populations.blue[0];sim.agents=[new Agent(SPECIES[0],gR,0,300,300,0),new Agent(SPECIES[1],gG,0,330,300,0),new Agent(SPECIES[2],gB,0,360,300,0)];sim.arrows=[{x:290,y:300,vx:PROJECTILE_SPEED,vy:0,r:3,dead:false,hitTeams:{}}];for(let i=0;i<20;i++){sim.tick++;stepBattlefield();}})()`);
assert.strictEqual(ev('sim.agents.filter(a=>a.alive).length'),0,'a species was shielded from the same Battlefield arrow by another colour');

// Invader fire density: deterministic ten-second sample should be challenging, not a wall.
resetMode('invaders');
ev('sim.projectiles=[];');
for(let i=0;i<600;i++)ev('sim.tick++;stepInvaders();');
const invaderShots=ev("sim.projectiles.filter(p=>p.team==='invader').length");
assert.ok(invaderShots>=15&&invaderShots<=45,`Invader fire density ${invaderShots}/10s outside expected 15–45 range`);

// Larger brains may mutate more weights, but the scaled mutation scheme must reduce
// the per-gene penalty as hidden-neuron count rises.
const genome=n=>77*n+n+n*18+18;
const rate=n=>0.06*Math.sqrt(genome(4)/genome(n));
assert.ok(rate(20)<rate(4)&&rate(64)<rate(20),'mutation rate is not scaled down for larger brains');
assert.ok(genome(64)*rate(64)<genome(64)*0.06,'64-neuron brain still receives the old full-rate mutation burden');

console.log('BattlEvo gameplay audit passed.');
console.log(JSON.stringify({
  speedRatio:+ratio.toFixed(3),
  stationary100pxReactionSeconds:+(reaction100Ticks/60).toFixed(3),
  lateralDodgeAt100px:+lateral100.toFixed(1),
  fleeing100pxCatchSeconds:+(fleeingCatch100/60).toFixed(3),
  battlefieldStartProgress:starts.map(x=>+x.toFixed(4)),
  invaderBreachDistance:breachDistances.map(x=>+x.toFixed(1)),
  invaderShotsPer10s:invaderShots
},null,2));

Math.random=originalRandom;
