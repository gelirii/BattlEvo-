'use strict';

function blankSpeciesCounter(fields){const out={};for(const s of SPECIES){out[s.id]={};for(const f of fields)out[s.id][f]=0;}return out;}
function makeLifetimeStats(){return{target:blankSpeciesCounter(['hits']),battlefield:blankSpeciesCounter(['crosses']),invaders:blankSpeciesCounter(['kills']),royale:blankSpeciesCounter(['kills','deaths'])};}
function cloneLifetimeStats(stats){return copyJson(stats||makeLifetimeStats());}
function lifetimeAdd(mode,speciesId,key,amount=1){const bucket=sim?.lifetime?.[mode]?.[speciesId];if(!bucket||typeof bucket[key]!=='number')return;bucket[key]+=amount;}
function lifetimeMetric(mode,speciesId){
  const zero={label:'TOTAL',value:'0',score:0,hasData:false,eligible:false,provisional:false};
  const bucket=sim?.lifetime?.[mode]?.[speciesId];
  if(!bucket){if(mode==='target')return{...zero,label:'TOTAL HITS'};if(mode==='battlefield')return{...zero,label:'TOTAL CROSSES'};if(mode==='invaders')return{...zero,label:'TOTAL KILLS'};return{...zero,label:'CAREER K:D',value:'— · 0K / 0D'};}
  if(mode==='target')return{label:'TOTAL HITS',value:String(bucket.hits),score:bucket.hits,hasData:bucket.hits>0,eligible:bucket.hits>0,provisional:false};
  if(mode==='battlefield')return{label:'TOTAL CROSSES',value:String(bucket.crosses),score:bucket.crosses,hasData:bucket.crosses>0,eligible:bucket.crosses>0,provisional:false};
  if(mode==='invaders')return{label:'TOTAL KILLS',value:String(bucket.kills),score:bucket.kills,hasData:bucket.kills>0,eligible:bucket.kills>0,provisional:false};
  const kills=bucket.kills,deaths=bucket.deaths,raw=deaths===0?(kills>0?Infinity:0):kills/deaths,rawText=kills===0&&deaths===0?'—':Number.isFinite(raw)?raw.toFixed(2):'∞';
  const engagements=kills+deaths,eligible=engagements>=10,score=(kills+1)/(deaths+1);
  return{label:'CAREER K:D',value:`${rawText} · ${kills}K / ${deaths}D${eligible?'':' · provisional'}`,score,hasData:engagements>0,eligible,provisional:!eligible};
}
