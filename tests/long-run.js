'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0xC0FFEE42;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}});
const elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:'',classList:{toggle(){},remove(){}}}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code);
const modes=['target','battlefield','invaders','royale'];
const reports={};

function lifetimeSnapshot(mode){return ev(`Object.fromEntries(SPECIES.map(s=>[s.id,lifetimeMetric('${mode}',s.id).value]))`);}
function numericSnapshot(mode){
  if(mode==='target')return ev(`Object.fromEntries(SPECIES.map(s=>[s.id,sim.lifetime.target[s.id].hits]))`);
  if(mode==='battlefield')return ev(`Object.fromEntries(SPECIES.map(s=>[s.id,sim.lifetime.battlefield[s.id].crosses]))`);
  if(mode==='invaders')return ev(`Object.fromEntries(SPECIES.map(s=>[s.id,sim.lifetime.invaders[s.id].kills]))`);
  return ev(`Object.fromEntries(SPECIES.map(s=>[s.id,{kills:sim.lifetime.royale[s.id].kills,deaths:sim.lifetime.royale[s.id].deaths}]))`);
}

for(const mode of modes){
  elements['brain-red'].value='4';elements['brain-green'].value='10';elements['brain-blue'].value='20';ev(`selectedMode='${mode}';paused=false;initSimulation();`);
  const start=process.hrtime.bigint(),perGeneration=[];let ticks=0,lastGen=1,guard=0;
  while(ev('sim.generation')<=6&&guard<36000){ev('step();');ticks++;guard++;const g=ev('sim.generation');if(g!==lastGen){perGeneration.push({completed:lastGen,total:numericSnapshot(mode),rounds:ev(`sim.lifetimeRounds.${mode}`)});lastGen=g;}}
  const ms=Number(process.hrtime.bigint()-start)/1e6;
  assert.ok(ev('sim.generation')>=7,`${mode}: six-generation / twelve-trial playtest did not complete`);
  assert.strictEqual(ev(`sim.lifetimeRounds.${mode}`),12,`${mode}: six generations should contain twelve trials`);
  assert.ok(ev('sim.agents.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.fitness))'),`${mode}: non-finite agent state`);
  assert.ok(ev('Object.values(sim.populations).flat().every(g=>g.brain.g.every(Number.isFinite))'),`${mode}: non-finite genome state`);
  const totals=numericSnapshot(mode);
  if(mode==='target')assert.ok(Object.values(totals).reduce((a,b)=>a+b,0)>0,'Target Practice produced zero hits across six generations');
  if(mode==='invaders')assert.ok(Object.values(totals).reduce((a,b)=>a+b,0)>0,'Invaders produced zero kills across six generations');
  if(mode==='royale')assert.ok(Object.values(totals).reduce((a,b)=>a+b.kills,0)>0,'Battle Royale produced zero kills across six generations');
  reports[mode]={ticks,ms:+ms.toFixed(1),ticksPerSecond:+(ticks/(ms/1000)).toFixed(0),generations:perGeneration,display:lifetimeSnapshot(mode)};
}

// Worst-case all-64N throughput sample with 48 simultaneously simulated creatures.
elements['brain-red'].value=elements['brain-green'].value=elements['brain-blue'].value='64';ev("selectedMode='royale';paused=false;initSimulation();");
assert.strictEqual(ev('sim.agents.length'),48);
const agent=ev('sim.agents[0]'),input1=ev('buildInputs(sim.agents[0])'),input2=ev('buildInputs(sim.agents[0])');assert.strictEqual(input1,input2,'sensory input buffer is being reallocated');const out1=agent.genotype.brain.run(input1),out2=agent.genotype.brain.run(input1);assert.strictEqual(out1,out2,'brain output buffer is being reallocated');
const heavyStart=process.hrtime.bigint();for(let i=0;i<240;i++)ev('step();');const heavyMs=Number(process.hrtime.bigint()-heavyStart)/1e6;assert.ok(ev('sim.agents.every(a=>Number.isFinite(a.fitness))'));
reports.all64Royale={population:'16×3',trialsPerGeneration:2,ticks:240,ms:+heavyMs.toFixed(1),ticksPerSecond:+(240/(heavyMs/1000)).toFixed(0),realtimeMultiple:+((240/(heavyMs/1000))/60).toFixed(1)};

console.log('BattlEvo RC2 multi-generation stress playtest passed.');console.log(JSON.stringify(reports,null,2));