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
const positionsUnique=()=>new Set(ev('sim.agents.map(a=>`${a.x.toFixed(3)},${a.y.toFixed(3)}`)')).size===ev('sim.agents.length');

assert.strictEqual(ev('INPUTS'),77,'sensory input count changed unexpectedly');
assert.strictEqual(ev('OUTPUTS'),18,'action output count changed unexpectedly');
assert.strictEqual(ev('FIELD.size'),ev('H'),'combat field must remain square');
assert.ok(ev('SIGHT_RANGE>=Math.hypot(FIELD.size,FIELD.size)'),'forward sight must cover the full combat field');

const speedRatio=ev('PROJECTILE_SPEED/AGENT_SPEED');
assert.ok(speedRatio>=2.6&&speedRatio<=3.0,`projectile/creature ratio ${speedRatio.toFixed(2)} left intended dodgeable window`);
const catchSeconds=ev('200/(PROJECTILE_SPEED-AGENT_SPEED)/60');
const dodgeAt100=ev('(100/PROJECTILE_SPEED)*AGENT_SPEED');
assert.ok(catchSeconds>.8&&catchSeconds<1.5,'200px fleeing catch time should be about a second');
assert.ok(dodgeAt100>ev('AGENT_R*3'),'100px warning should leave room for a meaningful sidestep');
console.log(`Physics: creature ${(ev('AGENT_SPEED')*60).toFixed(0)} px/s · projectile ${(ev('PROJECTILE_SPEED')*60).toFixed(0)} px/s · ratio ${speedRatio.toFixed(2)}x · 200px fleeing catch ${catchSeconds.toFixed(2)}s.`);

// Brain-size fairness: random-output scale must not explode with hidden-layer size.
const rmsByHidden={};
for(const hidden of [4,10,20,64]){
  let sum=0,count=0;
  for(let b=0;b<80;b++){
    const brain=ev(`new Brain(${hidden})`),probe=new Float32Array(77);
    for(let i=0;i<probe.length;i++)probe[i]=Math.sin((i+1)*0.73)*0.7;
    const out=brain.run(probe);
    for(const v of out){sum+=v*v;count++;}
  }
  rmsByHidden[hidden]=Math.sqrt(sum/count);
}
const rms=Object.values(rmsByHidden);
assert.ok(Math.max(...rms)/Math.min(...rms)<2.2,`random output scale diverged across brain sizes: ${JSON.stringify(rmsByHidden)}`);
console.log('Random brain output RMS:',Object.entries(rmsByHidden).map(([h,v])=>`${h}N=${v.toFixed(3)}`).join(' · '));

// Boot/runtime checks using the actual default 4/10/20-neuron comparison.
for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);
  assert.strictEqual(ev('sim.agents.length'),36,`${mode}: expected 12 agents per species`);
  assert.strictEqual(ev('buildInputs(sim.agents[0]).length'),77,`${mode}: sensory vector mismatch`);
  assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'),`${mode}: agent spawned outside combat field`);
  assert.ok(positionsUnique(),`${mode}: agents are exactly stacked`);
  for(let i=0;i<180;i++)ev('step();');
  assert.ok(ev('sim&&sim.generation>=1'),`${mode}: runtime stopped unexpectedly`);
}

// Changing scenario keeps the actual population objects.
init('target');
const before=ev('sim.populations.red[0].brain');
ev("sim.mode='battlefield';setupGeneration();");
assert.strictEqual(before,ev('sim.populations.red[0].brain'),'switching scenario reset the evolved brain');

// The four Battlefield directions are rotated copies: identical starting progress.
const starts=[];
init('battlefield');
for(let o=0;o<4;o++){
  ev(`sim.orientation=${o};sim.agents=[];sim.bunkers=[];setupBattlefield();`);
  const ps=ev('sim.agents.map(a=>objectiveVector(a).progress)');
  starts.push(ps.reduce((a,b)=>a+b,0)/ps.length);
  assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'),`orientation ${o}: spawn escaped combat field`);
}
assert.ok(Math.max(...starts)-Math.min(...starts)<1e-6,`rotated starts differ: ${starts.join(', ')}`);

// Direct sight: cover occludes a target; the bunker remains in memory after turning away.
init('target');
ev(`
  const testA=sim.agents[0];
  testA.x=FIELD.left+50;testA.y=FIELD.cy;testA.facing=0;testA.memory.clear();
  sim.bunkers=[newBunker(FIELD.left+130,FIELD.cy-20,40,40,'LOS')];
  sim.targets=[{x:FIELD.left+250,y:FIELD.cy,dx:1,dy:0,speed:AGENT_SPEED,r:9,id:99,hitFlash:0}];
  sim.projectiles=[];sim.arrows=[];
`);
let input=ev('buildInputs(testA)');
const centreEnemyIndex=9+3*8;
assert.strictEqual(input[centreEnemyIndex],0,'target behind bunker should be occluded');
assert.ok(ev("testA.memory.has('LOS')"),'visible bunker did not enter memory');
ev('testA.facing=4');input=ev('buildInputs(testA)');
assert.ok(Array.from(input.slice(65,73)).reduce((a,b)=>a+b,0)>0,'remembered bunker vanished after turning away');
ev('testA.facing=0;sim.bunkers=[]');input=ev('buildInputs(testA)');
assert.ok(input[centreEnemyIndex]>0,'removing bunker did not reveal target');

// Far-forward sight reaches almost across the full square.
ev('testA.x=FIELD.left+10;testA.y=FIELD.cy;testA.facing=0;sim.targets=[{x:FIELD.right-10,y:FIELD.cy,dx:0,dy:0,speed:AGENT_SPEED,r:9,id:98,hitFlash:0}]');
input=ev('buildInputs(testA)');
assert.ok(input[centreEnemyIndex]>0,'far forward target should still be sensed');

// Diagonal target velocity is normalized to actual movement components.
ev('testA.x=FIELD.left+100;testA.y=100;testA.facing=1;testA.memory.clear();sim.targets=[{x:FIELD.left+300,y:300,dx:1,dy:1,speed:AGENT_SPEED,r:9,id:97,hitFlash:0}];sim.bunkers=[]');
input=ev('buildInputs(testA)');
assert.ok(Math.abs(input[centreEnemyIndex+1]-Math.SQRT1_2)<.02,'diagonal x velocity is overstated');
assert.ok(Math.abs(input[centreEnemyIndex+2]-Math.SQRT1_2)<.02,'diagonal y velocity is overstated');

// Battlefield ignores the fire output entirely.
init('battlefield');
ev(`for(const a of sim.agents){a.genotype.brain.run=()=>{const o=new Float32Array(18);o[0]=1;o[9]=1;o[17]=10;return o;};}`);
for(let i=0;i<5;i++)ev('stepAgents();');
assert.strictEqual(ev('sim.projectiles.length'),0,'Battlefield emitted species projectiles');
assert.strictEqual(ev('sim.agents.reduce((n,a)=>n+a.shots,0)'),0,'Battlefield counted phantom shots');

// A Battlefield arrow is one visual trajectory but one independent collision per species.
init('battlefield');
ev(`
  const trio=SPECIES.map(s=>sim.agents.find(a=>a.species.id===s.id));
  for(const a of sim.agents){a.x=FIELD.left+20;a.y=FIELD.top+20;}
  for(const a of trio){a.x=FIELD.cx;a.y=FIELD.cy;a.alive=true;a.finished=false;}
  sim.tick=1;sim.arrows=[{x:FIELD.cx-PROJECTILE_SPEED,y:FIELD.cy,vx:PROJECTILE_SPEED,vy:0,r:3,dead:false,hitTeams:{}}];
  stepBattlefield();
`);
assert.ok(ev('trio.every(a=>!a.alive)'),'one species shielded another from a Battlefield arrow');

// Invader firing is capped to the front-most alien in each of seven columns.
init('invaders');
ev('for(const n of sim.invaders)n.fireClock=0;sim.projectiles=[];stepInvaders();');
const volley=ev("sim.projectiles.filter(p=>p.team==='invader').length");
assert.ok(volley>0&&volley<=7,`Invaders opening volley should be 1..7 shots, got ${volley}`);

// Invader kills are per-colour: Red cannot steal Green/Blue's copy of a target.
init('invaders');
ev(`
  const redA=sim.agents.find(a=>a.species.id==='red'),n0=sim.invaders[0];
  sim.bunkers=[];sim.projectiles=[{x:n0.x-PROJECTILE_SPEED,y:n0.y,vx:PROJECTILE_SPEED,vy:0,owner:redA,team:'red',r:2.5,dead:false}];
  stepProjectiles();
`);
assert.strictEqual(ev('n0.aliveFor.red'),false,'Red shot did not clear Red copy');
assert.strictEqual(ev('n0.aliveFor.green'),true,'Red stole Green copy');
assert.strictEqual(ev('n0.aliveFor.blue'),true,'Red stole Blue copy');

// Incoming Invader fire likewise challenges each species independently; the first colour
// hit cannot make the bullet disappear for the other two.
init('invaders');
ev(`
  const trio2=SPECIES.map(s=>sim.agents.find(a=>a.species.id===s.id));
  for(const a of sim.agents){a.x=FIELD.left+20;a.y=FIELD.top+20;}
  for(const a of trio2){a.x=FIELD.cx;a.y=FIELD.cy;a.alive=true;a.finished=false;}
  sim.bunkers=[];sim.projectiles=[{x:FIELD.cx-PROJECTILE_SPEED,y:FIELD.cy,vx:PROJECTILE_SPEED,vy:0,owner:null,team:'invader',r:2.5,dead:false,hitTeams:{}}];
  stepProjectiles();
`);
assert.ok(ev('trio2.every(a=>!a.alive)'),'one species shielded the others from an Invader shot');

// Actual target/invader displacement never exceeds creature speed.
init('target');
let x=ev('sim.targets[2].x'),y=ev('sim.targets[2].y');ev('stepTargets();');
let dx=ev('sim.targets[2].x')-x,dy=ev('sim.targets[2].y')-y;
assert.ok(Math.hypot(dx,dy)<=ev('AGENT_SPEED')+1e-6,'moving target exceeded creature speed');
init('invaders');
x=ev('sim.invaders[0].x');y=ev('sim.invaders[0].y');ev('stepInvaders();');
dx=ev('sim.invaders[0].x')-x;dy=ev('sim.invaders[0].y')-y;
assert.ok(Math.hypot(dx,dy)<=ev('AGENT_SPEED')+1e-6,'invader exceeded creature speed');

// Battle Royale team homes are equidistant.
init('royale');
const centroids=ev(`SPECIES.map(s=>{const a=sim.agents.filter(x=>x.species.id===s.id);return{x:a.reduce((n,x)=>n+x.x,0)/a.length,y:a.reduce((n,x)=>n+x.y,0)/a.length};})`);
const pd=[];for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)pd.push(Math.hypot(centroids[i].x-centroids[j].x,centroids[i].y-centroids[j].y));
assert.ok(Math.max(...pd)-Math.min(...pd)<1,'Royale team homes are not equidistant');

// Complete a generation in every scenario with small brains to catch end-of-round bugs.
elements['brain-red'].value=elements['brain-green'].value=elements['brain-blue'].value='2';
for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);let guard=0;
  while(ev('sim.generation')===1&&guard<2600){ev('step();');guard++;}
  assert.strictEqual(ev('sim.generation'),2,`${mode}: generation did not finish/evolve`);
  assert.ok(ev('sim.lastSummary.length')>5,`${mode}: missing round summary`);
  console.log(`${mode}: ${ev('sim.lastSummary')}`);
}

const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('ui.js','utf8');
for(const match of ui.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes(`id="${match[1]}"`),`UI references missing #${match[1]}`);
for(const file of ['core.js','brain-world.js','modes.js','ui.js','style.css'])assert.ok(fs.existsSync(file),`missing browser asset ${file}`);

console.log('BattlEvo gameplay audit passed.');
