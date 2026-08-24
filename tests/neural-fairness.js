'use strict';

const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

let seed=0x5EEDBEEF;
Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};

const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}});
const elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};
global.performance={now:()=>0};
global.setRunningUI=()=>{};global.updateHud=()=>{};
vm.runInThisContext(fs.readFileSync('core.js','utf8'),{filename:'core.js'});
const ev=code=>vm.runInThisContext(code);

const sizes=[4,10,20,64];
const inputStd=1/Math.sqrt(ev('INPUTS'));
for(const h of sizes){
  const l=ev(`genomeLayout(${h})`);
  assert.ok(Math.abs(ev(`geneStd(${h},0)`)-inputStd)<1e-12,`${h}N input weights are not fan-in normalised`);
  assert.ok(Math.abs(ev(`geneStd(${h},${l.outputWeightBase})`)*Math.sqrt(h)-1)<1e-12,`${h}N output weights are not 1/sqrt(hidden)`);
}

// Fixed input probes: all brain sizes receive the same sensory patterns. We sample many
// independently initialised brains and compare RMS output scale. A wider brain may behave
// differently, but it must not begin with systematically louder action logits.
const INPUTS_N=ev('INPUTS'),OUTPUTS_N=ev('OUTPUTS');
const probes=Array.from({length:32},()=>Float32Array.from({length:INPUTS_N},()=>Math.random()*2-1));
const stats={};
for(const h of sizes){
  let sumSq=0,count=0,maxAbs=0;
  for(let b=0;b<80;b++){
    const brain=ev(`new Brain(${h})`);
    for(const input of probes){
      const out=brain.run(input);
      for(let i=0;i<OUTPUTS_N;i++){const v=out[i];sumSq+=v*v;count++;maxAbs=Math.max(maxAbs,Math.abs(v));}
    }
  }
  stats[h]={rms:Math.sqrt(sumSq/count),maxAbs};
}
const rms=sizes.map(h=>stats[h].rms),spread=Math.max(...rms)/Math.min(...rms);
assert.ok(spread<1.22,`random output RMS still depends too strongly on brain size (${spread.toFixed(3)}x spread)`);

// No hidden width should start with a dramatically different propensity to fire. The
// fire logit is symmetric around zero, so positive-fire rate should stay near 50%.
const fireRates={};
for(const h of sizes){
  let positive=0,total=0;
  for(let b=0;b<80;b++){
    const brain=ev(`new Brain(${h})`);
    for(const input of probes){if(brain.run(input)[17]>0)positive++;total++;}
  }
  fireRates[h]=positive/total;
  assert.ok(fireRates[h]>0.42&&fireRates[h]<0.58,`${h}N initial fire bias ${fireRates[h].toFixed(3)} is too far from neutral`);
}

console.log('BattlEvo neural fairness audit passed.');
console.log(JSON.stringify({outputRms:Object.fromEntries(sizes.map(h=>[`${h}N`,+stats[h].rms.toFixed(4)])),rmsSpread:+spread.toFixed(3),positiveFireRate:Object.fromEntries(sizes.map(h=>[`${h}N`,+fireRates[h].toFixed(3)]))},null,2));
