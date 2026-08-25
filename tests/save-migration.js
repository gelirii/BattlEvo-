'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0x470BEEF;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'2'},'brain-green':{value:'12'},'brain-blue':{value:'30'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);
ev("selectedMode='royale';initSimulation();");

// Build an RC1-shaped save: schema 1, 12 brains/species, no trial or accumulated fitness field.
const legacy=ev(`(()=>({schema:1,gameVersion:'v1.0.0-rc.1',mode:'royale',generation:470,lifetime:cloneLifetimeStats(sim.lifetime),lifetimeRounds:{target:86,battlefield:162,invaders:100,royale:89},populations:Object.fromEntries(SPECIES.map(s=>[s.id,sim.populations[s.id].slice(0,12).map(g=>({hidden:g.brain.hidden,genome:Array.from(g.brain.g),best:g.best}))]))}))()`);
const firstGenes=Object.fromEntries(['red','green','blue'].map(id=>[id,legacy.populations[id].map(r=>r.genome.slice(0,8))]));
ev(`restoreSimulation(${JSON.stringify(legacy)});`);
assert.strictEqual(ev('sim.generation'),470);assert.strictEqual(ev('sim.trial'),1);assert.strictEqual(ev('sim.populations.red.length'),16);assert.strictEqual(ev('sim.populations.green.length'),16);assert.strictEqual(ev('sim.populations.blue.length'),16);
assert.strictEqual(ev('sim.populations.red[0].brain.hidden'),2);assert.strictEqual(ev('sim.populations.green[0].brain.hidden'),12);assert.strictEqual(ev('sim.populations.blue[0].brain.hidden'),30);
for(const id of ['red','green','blue'])for(let i=0;i<12;i++)assert.deepStrictEqual(Array.from(ev(`sim.populations.${id}[${i}].brain.g.slice(0,8)`)),firstGenes[id][i],`${id} legacy genome ${i} changed during expansion`);
assert.deepStrictEqual(ev('sim.lifetimeRounds'),{target:86,battlefield:162,invaders:100,royale:89});

// RC2 checkpoints must retain a completed first-trial fitness contribution.
ev("sim.trial=2;sim.populations.red[0].fitness=123.5;");
const rc2=ev(`({schema:2,mode:sim.mode,generation:sim.generation,trial:sim.trial,lifetime:cloneLifetimeStats(sim.lifetime),lifetimeRounds:sim.lifetimeRounds,populations:Object.fromEntries(SPECIES.map(s=>[s.id,sim.populations[s.id].map(g=>({hidden:g.brain.hidden,genome:Array.from(g.brain.g),fitness:g.fitness,best:g.best}))]))})`);
ev(`restoreSimulation(${JSON.stringify(rc2)});`);assert.strictEqual(ev('sim.trial'),2);assert.strictEqual(ev('sim.populations.red[0].fitness'),123.5);

console.log('BattlEvo RC1→RC2 save migration audit passed.');