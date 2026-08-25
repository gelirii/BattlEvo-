'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0x7A267E7;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});const ev=code=>vm.runInThisContext(code);
ev("selectedMode='target';initSimulation();");
assert.strictEqual(ev('sim.agents.length'),36);assert.strictEqual(ev('sim.targets.length'),6);assert.strictEqual(ev('sim.bunkers.length'),3);
const quadrants={agents:new Set(),targets:new Set()},signatures=new Set(),facings=new Set(),headings=new Set();let allAgentX=[],allAgentY=[],allTargetX=[],allTargetY=[];
for(let gen=0;gen<16;gen++){
  if(gen)ev('sim.agents=[];sim.bunkers=[];sim.targets=[];setupTarget();');
  const snap=ev(`({agents:sim.agents.map(a=>({x:a.x,y:a.y,f:a.facing,s:a.species.id})),targets:sim.targets.map(t=>({x:t.x,y:t.y,dx:t.dx,dy:t.dy})),bunkers:sim.bunkers.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h}))})`),q=p=>(p.x<480?0:1)+(p.y<300?0:2);
  snap.agents.forEach(a=>{quadrants.agents.add(q(a));facings.add(a.f);allAgentX.push(a.x);allAgentY.push(a.y);});snap.targets.forEach(t=>{quadrants.targets.add(q(t));headings.add(ev(`vecToDir(${t.dx},${t.dy})`));allTargetX.push(t.x);allTargetY.push(t.y);});signatures.add(JSON.stringify({a:snap.agents.filter(a=>a.s==='red'),t:snap.targets,b:snap.bunkers}));
  assert.ok(ev('sim.agents.every(a=>inArenaPoint(a)&&!sim.bunkers.some(b=>rectCircleHit(b,a,AGENT_R)))'));assert.ok(ev('sim.targets.every(t=>inArenaPoint(t)&&!sim.bunkers.some(b=>rectCircleHit(b,t,t.r)))'));assert.ok(ev('sim.bunkers.every((b,i)=>sim.bunkers.every((o,j)=>i===j||!targetRectOverlaps(b,o,0)))'));
  const matched=ev(`(()=>{const key=id=>sim.agents.filter(a=>a.species.id===id).map(a=>[a.x.toFixed(4),a.y.toFixed(4),a.facing].join(',')).sort();return JSON.stringify(key('red'))===JSON.stringify(key('green'))&&JSON.stringify(key('red'))===JSON.stringify(key('blue'));})()`);assert.ok(matched,'species did not receive matched physical Target Practice starts');
}
assert.strictEqual(quadrants.agents.size,4);assert.strictEqual(quadrants.targets.size,4);assert.ok(signatures.size>=15);assert.strictEqual(facings.size,8);assert.strictEqual(headings.size,8);assert.ok(Math.max(...allAgentX)-Math.min(...allAgentX)>500);assert.ok(Math.max(...allAgentY)-Math.min(...allAgentY)>500);assert.ok(Math.max(...allTargetX)-Math.min(...allTargetX)>450);assert.ok(Math.max(...allTargetY)-Math.min(...allTargetY)>450);
for(let i=0;i<600;i++)ev('sim.tick++;stepTargets();');assert.ok(ev('sim.targets.every(t=>inArenaPoint(t))'));
console.log('Target Practice matched-randomization audit passed.');console.log(JSON.stringify({layouts:signatures.size,agentQuadrants:[...quadrants.agents],targetQuadrants:[...quadrants.targets],facings:facings.size,targetHeadings:headings.size},null,2));
