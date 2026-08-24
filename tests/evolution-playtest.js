'use strict';

const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

let seed=0xE701A11;
Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};

const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}});
const elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};
global.performance={now:()=>0};
global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};
for(const file of ['core.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);

const SPEC=['red','green','blue'];
const GENS=10;
const records=[];
const originalFinish=finishGeneration;
finishGeneration=function(){
  const row={mode:sim.mode,generation:sim.generation,winner:sim.winner||null,reason:sim.endReason||'time',species:{}};
  for(const id of SPEC){
    const a=sim.agents.filter(x=>x.species.id===id),fit=a.map(x=>x.fitness).sort((x,y)=>x-y);
    row.species[id]={
      best:+Math.max(...fit).toFixed(2),
      mean:+(fit.reduce((x,y)=>x+y,0)/fit.length).toFixed(2),
      median:+fit[Math.floor(fit.length/2)].toFixed(2),
      hits:a.reduce((n,x)=>n+x.hits,0),
      kills:a.reduce((n,x)=>n+x.kills,0),
      shots:a.reduce((n,x)=>n+x.shots,0),
      crossed:a.filter(x=>x.finished).length,
      alive:a.filter(x=>x.alive).length,
      remainingInvaders:sim.mode==='invaders'?sim.invaders.filter(n=>n.aliveFor?.[id]).length:null,
      cleared:sim.mode==='invaders'?!!sim.invaderCleared[id]:null
    };
  }
  records.push(row);
  return originalFinish();
};

function runMode(mode){
  selectedMode=mode;initSimulation();
  const targetGen=GENS+1;let ticks=0;
  while(sim.generation<targetGen&&ticks<GENS*MAX_TICKS[mode]+100){step();ticks++;}
  assert.strictEqual(sim.generation,targetGen,`${mode}: playtest failed to finish ${GENS} generations`);
  return ticks;
}

const ticksByMode={};
for(const mode of ['target','battlefield','invaders','royale'])ticksByMode[mode]=runMode(mode);

function metric(mode,r,id){
  const s=r.species[id];
  if(mode==='target')return s.hits;
  if(mode==='battlefield')return s.crossed;
  if(mode==='invaders')return s.kills;
  return s.kills;
}
function avg(arr){return arr.reduce((a,b)=>a+b,0)/arr.length;}

const report={};
for(const mode of ['target','battlefield','invaders','royale']){
  const rows=records.filter(r=>r.mode===mode);
  report[mode]={ticks:ticksByMode[mode],species:{}};
  for(const id of SPEC){
    const first=rows.slice(0,3),last=rows.slice(-3);
    report[mode].species[id]={
      hidden:id==='red'?4:id==='green'?10:20,
      first3Metric:+avg(first.map(r=>metric(mode,r,id))).toFixed(2),
      last3Metric:+avg(last.map(r=>metric(mode,r,id))).toFixed(2),
      first3BestFitness:+avg(first.map(r=>r.species[id].best)).toFixed(2),
      last3BestFitness:+avg(last.map(r=>r.species[id].best)).toFixed(2),
      peakMetric:Math.max(...rows.map(r=>metric(mode,r,id))),
      peakBestFitness:+Math.max(...rows.map(r=>r.species[id].best)).toFixed(2),
      clears:mode==='invaders'?rows.filter(r=>r.species[id].cleared).length:undefined,
      wins:mode==='royale'?rows.filter(r=>r.winner===id).length:undefined
    };
  }
}

// Sanity checks for pathological evolution failures rather than demanding monotonic learning.
for(const mode of Object.keys(report))for(const id of SPEC){
  const s=report[mode].species[id];
  assert.ok(Number.isFinite(s.peakBestFitness),`${mode}/${id}: non-finite fitness`);
  assert.ok(s.peakBestFitness>-1000,`${mode}/${id}: pathological fitness collapse`);
}

console.log('BattlEvo 10-generation playtest completed.');
console.log(JSON.stringify(report,null,2));
