'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0xC0B3A11;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code),expected={target:3,battlefield:4,invaders:3,royale:6};
for(const mode of Object.keys(expected)){
  const signatures=new Set();
  for(let i=0;i<40;i++){
    ev(`selectedMode='${mode}';initSimulation();`);
    assert.strictEqual(ev('sim.bunkers.length'),expected[mode]);
    assert.ok(ev('sim.agents.every(a=>sim.bunkers.every(b=>!rectCircleHit(b,a,AGENT_R+10)))'),`${mode}: spawn/bunker collision`);
    assert.ok(ev('sim.bunkers.every((b,i)=>sim.bunkers.every((o,j)=>i===j||!rectOverlap(b,o,10)))'),`${mode}: cover overlap`);
    if(mode==='target')assert.ok(ev('sim.targets.every(t=>sim.bunkers.every(b=>!rectCircleHit(b,t,t.r+10)))'),'target/bunker collision');
    if(mode==='invaders')assert.ok(ev('sim.invaders.every(n=>sim.bunkers.every(b=>!rectCircleHit(b,n,n.r+8)))'),'invader/bunker collision');
    signatures.add(ev("JSON.stringify(sim.bunkers.map(b=>[Math.round(b.x),Math.round(b.y),Math.round(b.w),Math.round(b.h)]))"));
  }
  assert.ok(signatures.size>=36,`${mode}: insufficient cover randomisation`);
}
console.log('BattlEvo RC4 random-cover stress audit passed.');
