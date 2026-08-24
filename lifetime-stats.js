'use strict';

function blankSpeciesCounter(fields){
  const out={};
  for(const s of SPECIES){out[s.id]={};for(const f of fields)out[s.id][f]=0;}
  return out;
}

function makeLifetimeStats(){
  return{
    target:blankSpeciesCounter(['hits']),
    battlefield:blankSpeciesCounter(['crosses']),
    invaders:blankSpeciesCounter(['kills']),
    royale:blankSpeciesCounter(['kills','deaths'])
  };
}

function lifetimeAdd(mode,speciesId,key,amount=1){
  const bucket=sim?.lifetime?.[mode]?.[speciesId];
  if(!bucket||typeof bucket[key]!=='number')return;
  bucket[key]+=amount;
}

function lifetimeMetric(mode,speciesId){
  const zero={label:'TOTAL',value:'0',score:0,hasData:false};
  const bucket=sim?.lifetime?.[mode]?.[speciesId];
  if(!bucket){
    if(mode==='target')return{...zero,label:'TOTAL HITS'};
    if(mode==='battlefield')return{...zero,label:'TOTAL CROSSES'};
    if(mode==='invaders')return{...zero,label:'TOTAL KILLS'};
    return{...zero,label:'CAREER K:D',value:'— · 0K / 0D'};
  }
  if(mode==='target')return{label:'TOTAL HITS',value:String(bucket.hits),score:bucket.hits,hasData:bucket.hits>0};
  if(mode==='battlefield')return{label:'TOTAL CROSSES',value:String(bucket.crosses),score:bucket.crosses,hasData:bucket.crosses>0};
  if(mode==='invaders')return{label:'TOTAL KILLS',value:String(bucket.kills),score:bucket.kills,hasData:bucket.kills>0};
  const kills=bucket.kills,deaths=bucket.deaths;
  const ratio=deaths===0?(kills>0?Infinity:0):kills/deaths;
  const ratioText=kills===0&&deaths===0?'—':Number.isFinite(ratio)?ratio.toFixed(2):'∞';
  return{label:'CAREER K:D',value:`${ratioText} · ${kills}K / ${deaths}D`,score:ratio,hasData:kills>0||deaths>0};
}

const initSimulationWithoutLifetime=initSimulation;
initSimulation=function(){
  initSimulationWithoutLifetime();
  sim.lifetime=makeLifetimeStats();
};
