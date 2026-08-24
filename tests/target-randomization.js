'use strict';

// PR verification copy: exercises the exact Target Practice randomization now on main.
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

let seed=0x7A267E7;
Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};

const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}});
const elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};
global.performance={now:()=>0};
global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};

for(const file of ['core.js','brain-world.js','modes.js','target-practice.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);

ev("selectedMode='target';initSimulation();");
assert.strictEqual(ev('sim.agents.length'),36,'Target Practice must spawn 36 creatures');
assert.strictEqual(ev('sim.targets.length'),6,'Target Practice must spawn six moving targets');
assert.strictEqual(ev('sim.bunkers.length'),3,'Target Practice must spawn three bunkers');

const quadrants={agents:new Set(),targets:new Set()};
const signatures=new Set();
const facings=new Set();
const headings=new Set();
let allAgentX=[],allAgentY=[],allTargetX=[],allTargetY=[];

for(let gen=0;gen<16;gen++){
  if(gen)ev('sim.agents=[];sim.bunkers=[];sim.targets=[];setupTarget();');
  const snap=ev(`({
    agents:sim.agents.map(a=>({x:a.x,y:a.y,f:a.facing,s:a.species.id})),
    targets:sim.targets.map(t=>({x:t.x,y:t.y,dx:t.dx,dy:t.dy})),
    bunkers:sim.bunkers.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h}))
  })`);
  const q=p=>(p.x<480?0:1)+(p.y<300?0:2);
  snap.agents.forEach(a=>{quadrants.agents.add(q(a));facings.add(a.f);allAgentX.push(a.x);allAgentY.push(a.y);});
  snap.targets.forEach(t=>{quadrants.targets.add(q(t));headings.add(`${Math.sign(t.dx)},${Math.sign(t.dy)}`);allTargetX.push(t.x);allTargetY.push(t.y);});
  signatures.add(JSON.stringify({a:snap.agents.slice(0,6),t:snap.targets,b:snap.bunkers}));

  for(const a of snap.agents){
    assert.ok(a.x>ev('FIELD.left')&&a.x<ev('FIELD.right')&&a.y>0&&a.y<ev('FIELD.bottom'),'creature spawned outside field');
  }
  assert.ok(ev('sim.agents.every(a=>!sim.bunkers.some(b=>rectCircleHit(b,a,AGENT_R)))'),'creature spawned inside bunker');
  assert.ok(ev('sim.targets.every(t=>!sim.bunkers.some(b=>rectCircleHit(b,t,t.r)))'),'target spawned inside bunker');
  assert.ok(ev('sim.bunkers.every((b,i)=>sim.bunkers.every((o,j)=>i===j||!targetRectOverlaps(b,o,0)))'),'bunkers overlap');
}

assert.strictEqual(quadrants.agents.size,4,'creatures did not populate all four arena quadrants');
assert.strictEqual(quadrants.targets.size,4,'targets did not populate all four arena quadrants');
assert.ok(signatures.size>=15,'Target Practice layouts are repeating instead of randomizing');
assert.ok(facings.size===8,'random creature facing did not cover all eight directions');
assert.ok(headings.size>=7,'moving targets are not using a broad set of headings');
assert.ok(Math.max(...allAgentX)-Math.min(...allAgentX)>500,'creature x spawns remain too constrained');
assert.ok(Math.max(...allAgentY)-Math.min(...allAgentY)>500,'creature y spawns remain too constrained');
assert.ok(Math.max(...allTargetX)-Math.min(...allTargetX)>450,'target x spawns remain too constrained');
assert.ok(Math.max(...allTargetY)-Math.min(...allTargetY)>450,'target y spawns remain too constrained');

for(let i=0;i<600;i++)ev('sim.tick++;stepTargets();');
assert.ok(ev('sim.targets.every(t=>inArenaPoint(t))'),'moving target escaped the field');

console.log('Target Practice randomization audit passed.');
console.log(JSON.stringify({layouts:signatures.size,agentQuadrants:[...quadrants.agents],targetQuadrants:[...quadrants.targets],facings:facings.size,targetHeadings:headings.size},null,2));
