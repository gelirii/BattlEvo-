'use strict';

const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

let seed=0xB4771E0;
Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/0x100000000;};

const fakeCtx=new Proxy({}, {
  get(target,prop){if(!(prop in target))target[prop]=()=>{};return target[prop];},
  set(target,prop,value){target[prop]=value;return true;}
});
const elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:'',classList:{toggle(){},remove(){}}}};
global.performance={now:()=>0};
global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};

for(const file of ['core.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);
const init=mode=>ev(`selectedMode='${mode}';initSimulation();`);

assert.strictEqual(ev('INPUTS'),77,'sensory input count changed unexpectedly');
assert.strictEqual(ev('OUTPUTS'),18,'action output count changed unexpectedly');
assert.strictEqual(ev('FIELD.size'),ev('H'),'combat field must remain square');
assert.ok(ev('SIGHT_RANGE>=Math.hypot(FIELD.size,FIELD.size)'),'forward sight must cover the full combat field');
assert.ok(ev('PROJECTILE_SPEED>AGENT_SPEED'),'projectiles must outrun creatures');

for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);
  assert.strictEqual(ev('sim.agents.length'),36,`${mode}: expected 12 agents per species`);
  assert.strictEqual(ev('buildInputs(sim.agents[0]).length'),77,`${mode}: sensory vector mismatch`);
  assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'),`${mode}: agent spawned outside combat field`);
  for(let i=0;i<180;i++)ev('step();');
  assert.ok(ev('sim&&sim.generation>=1'),`${mode}: runtime stopped unexpectedly`);
}

init('target');
const before=ev('sim.populations.red[0].brain');
ev("sim.mode='battlefield';setupGeneration();");
assert.strictEqual(before,ev('sim.populations.red[0].brain'),'switching scenario reset the evolved brain');

init('target');
let x=ev('sim.targets[2].x'),y=ev('sim.targets[2].y');ev('stepTargets();');
let dx=ev('sim.targets[2].x')-x,dy=ev('sim.targets[2].y')-y;
assert.ok(Math.hypot(dx,dy)<=ev('AGENT_SPEED')+1e-6,'moving target exceeded creature speed');

init('invaders');
x=ev('sim.invaders[0].x');y=ev('sim.invaders[0].y');ev('stepInvaders();');
dx=ev('sim.invaders[0].x')-x;dy=ev('sim.invaders[0].y')-y;
assert.ok(Math.hypot(dx,dy)<=ev('AGENT_SPEED')+1e-6,'invader exceeded creature speed');

// Complete a generation in every scenario with small brains to catch end-of-round bugs.
elements['brain-red'].value=elements['brain-green'].value=elements['brain-blue'].value='2';
for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);let guard=0;
  while(ev('sim.generation')===1&&guard<2600){ev('step();');guard++;}
  assert.strictEqual(ev('sim.generation'),2,`${mode}: generation did not finish/evolve`);
  assert.ok(ev('sim.lastSummary.length')>5,`${mode}: missing round summary`);
}

console.log('BattlEvo smoke test passed.');
