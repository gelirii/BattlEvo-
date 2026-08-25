'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0x470BEEF;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'2'},'brain-green':{value:'12'},'brain-blue':{value:'30'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''},addEventListener(){}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js','persistence.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);
ev("selectedMode='royale';initSimulation();sim.generation=470;sim.roundLifetimeBaseline=cloneLifetimeStats(sim.lifetime);");

// RC5 saves the new 599-input genome layout and remains scenario-independent species state.
const snap=ev('makeSaveSnapshot()');global.__snap=snap;
assert.strictEqual(snap.schema,4);assert.strictEqual(snap.inputCount,599);assert.strictEqual(snap.generation,470);assert.strictEqual('trial' in snap,false);assert.strictEqual('mode' in snap,false);assert.strictEqual(ev('snapshotCompatible(__snap)'),true);
for(const id of ['red','green','blue'])for(const row of snap.populations[id])assert.strictEqual(row.genome.length,ev(`genomeLayout(${row.hidden}).count`));

ev("restoreSimulation(__snap,'target');");assert.strictEqual(ev('sim.generation'),470);assert.strictEqual(ev('sim.trial'),1);assert.strictEqual(ev('sim.mode'),'target');assert.strictEqual(ev('sim.populations.red[0].brain.hidden'),2);assert.strictEqual(ev('sim.populations.green[0].brain.hidden'),12);assert.strictEqual(ev('sim.populations.blue[0].brain.hidden'),30);

// RC4/older genomes are intentionally rejected: their 77-input weights have no meaningful mapping to RC5 semantics.
const legacy={...snap,schema:3,inputCount:77};global.__legacy=legacy;
assert.strictEqual(ev('snapshotCompatible(__legacy)'),false);assert.throws(()=>ev("restoreSimulation(__legacy,'royale')"),/Unsupported BattlEvo save data/);
const malformed={...snap,populations:{...snap.populations,red:snap.populations.red.map((r,i)=>i? r:{...r,genome:r.genome.slice(1)})}};global.__malformed=malformed;
assert.strictEqual(ev('snapshotCompatible(__malformed)'),false);

console.log('BattlEvo RC5 save compatibility audit passed.');