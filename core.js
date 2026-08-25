'use strict';

// BattlEvo v1.0.0 RC6 — tactical visibility + continuous aiming release candidate.
const GAME_VERSION='v1.0.0-rc.6';
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const W=canvas.width,H=canvas.height;
const TAU=Math.PI*2;
const DIRS=Array.from({length:8},(_,i)=>({x:Math.cos(i*Math.PI/4),y:Math.sin(i*Math.PI/4)}));
const SPECIES=[
  {id:'red',color:'#ff4a4a',pale:'#ffaaaa'},
  {id:'green',color:'#45e06f',pale:'#a8f5bc'},
  {id:'blue',color:'#4f8cff',pale:'#a9c7ff'}
];
const POP_SIZE=16;
const TRIALS_PER_GENERATION=4;
const MIN_HIDDEN=1,MAX_HIDDEN=64;
const AGENT_SPEED=1.65;
const PROJECTILE_SPEED=4.6;
const AGENT_R=7;
const FIELD_SIZE=H;
const FIELD={left:(W-FIELD_SIZE)/2,right:(W+FIELD_SIZE)/2,top:0,bottom:H,size:FIELD_SIZE,cx:W/2,cy:H/2};

// Structured top-down tactical view. Static cover and actor tables are complete;
// projectile tables prioritise the closest semantically relevant shots to bound MLP size.
// Dynamic-slot state is line-of-sight visibility: occluded objects keep their coordinates.
const TACTICAL_SLOTS={bunkers:6,friends:15,enemies:32,friendlyProjectiles:12,enemyProjectiles:24};
const SELF_INPUTS=13,ACTOR_INPUTS=8,PROJECTILE_INPUTS=5,BUNKER_INPUTS=5;
const INPUTS=SELF_INPUTS
  +TACTICAL_SLOTS.bunkers*BUNKER_INPUTS
  +TACTICAL_SLOTS.friends*ACTOR_INPUTS
  +TACTICAL_SLOTS.enemies*ACTOR_INPUTS
  +TACTICAL_SLOTS.friendlyProjectiles*PROJECTILE_INPUTS
  +TACTICAL_SLOTS.enemyProjectiles*PROJECTILE_INPUTS;
const OUTPUTS=18;
const MAX_TICKS={target:1800,battlefield:1500,invaders:1800,royale:3600};
const MODE_CONFIG={
  target:{name:'Target Practice',icon:'◎',brief:'Targets are the only enemies. Each creature knows target positions even behind cover, gets a clear-shot visibility bit, sees only its own shots, and ignores every creature colour.'},
  battlefield:{name:'Battlefield Run',icon:'➜',brief:'Cross a rotated battlefield with fresh random cover. Teammates are known, other species are absent, and battlefield arrows are hostile projectiles with cover visibility.'},
  invaders:{name:'Invaders',icon:'▦',brief:'Invaders are enemies, teammates are friends, and each species knows relevant actor/projectile positions while cover marks whether each has a clear line of sight.'},
  royale:{name:'Battle Royale',icon:'✦',brief:'Teammates and their shots are friendly; both other colours and their shots are enemies. Cover hides line of sight, not location, and aiming is continuous through 360°.'}
};
const MODE_NAMES=Object.fromEntries(Object.entries(MODE_CONFIG).map(([k,v])=>[k,v.name]));
const SHOT_COST={target:0.5,battlefield:0,invaders:0.12,royale:0.1};

let sim=null;
let selectedMode='target';
let speed=1;
let paused=false;
let last=performance.now();

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rand(a=1,b=0){return b+Math.random()*(a-b);}
function randi(n){return Math.floor(Math.random()*n);}
function dist2(a,b){const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;}
function gaussian(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(TAU*v);}
function circleHit(a,b,ra,rb){return dist2(a,b)<=(ra+rb)*(ra+rb);}
function rectCircleHit(r,c,cr){const px=clamp(c.x,r.x,r.x+r.w),py=clamp(c.y,r.y,r.y+r.h),dx=c.x-px,dy=c.y-py;return dx*dx+dy*dy<=cr*cr;}
function vecToDir(x,y){if(Math.abs(x)<.001&&Math.abs(y)<.001)return-1;let a=Math.atan2(y,x);if(a<0)a+=TAU;return Math.round(a/(Math.PI/4))%8;}
function shuffledIndices(n){const a=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=randi(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function inArenaPoint(p,margin=0){return p.x>=FIELD.left-margin&&p.x<=FIELD.right+margin&&p.y>=FIELD.top-margin&&p.y<=FIELD.bottom+margin;}
function copyJson(v){return JSON.parse(JSON.stringify(v));}

function orientedPoint(x,y,o){const dx=x-FIELD.cx,dy=y-FIELD.cy;if(o===0)return{x,y};if(o===1)return{x:FIELD.cx-dy,y:FIELD.cy+dx};if(o===2)return{x:FIELD.cx-dx,y:FIELD.cy-dy};return{x:FIELD.cx+dy,y:FIELD.cy-dx};}
function orientedRect(x,y,w,h,o,id){const c=orientedPoint(x+w/2,y+h/2,o),odd=o%2===1,rw=odd?h:w,rh=odd?w:h;return newBunker(c.x-rw/2,c.y-rh/2,rw,rh,id);}
function orientedFacing(baseDir,o){return(baseDir+o*2)%8;}

function genomeLayout(hidden){const hiddenBiasBase=INPUTS*hidden,outputWeightBase=hiddenBiasBase+hidden,outputBiasBase=outputWeightBase+hidden*OUTPUTS;return{hiddenBiasBase,outputWeightBase,outputBiasBase,count:outputBiasBase+OUTPUTS};}
function geneStd(hidden,index){const l=genomeLayout(hidden);if(index<l.hiddenBiasBase)return 1/Math.sqrt(INPUTS);if(index<l.outputWeightBase)return.05;if(index<l.outputBiasBase)return 1/Math.sqrt(hidden);return.05;}
function randomGene(hidden,index){return gaussian()*geneStd(hidden,index);}

class Brain{
  constructor(hidden,genome=null){
    this.hidden=hidden;
    const count=genomeLayout(hidden).count;
    if(genome&&genome.length!==count)throw new Error(`Genome/input mismatch: expected ${count} genes, got ${genome.length}.`);
    this.g=genome?Float32Array.from(genome):Float32Array.from({length:count},(_,i)=>randomGene(hidden,i));
    this.hiddenBuffer=new Float32Array(hidden);
    this.outputBuffer=new Float32Array(OUTPUTS);
  }
  run(input){
    const h=this.hiddenBuffer,out=this.outputBuffer;h.fill(0);out.fill(0);let k=0;
    for(let j=0;j<this.hidden;j++){let sum=0;for(let i=0;i<INPUTS;i++)sum+=input[i]*this.g[k++];h[j]=Math.tanh(sum+this.g[INPUTS*this.hidden+j]);}
    k=INPUTS*this.hidden+this.hidden;
    for(let o=0;o<OUTPUTS;o++){let sum=0;for(let j=0;j<this.hidden;j++)sum+=h[j]*this.g[k++];out[o]=sum+this.g[INPUTS*this.hidden+this.hidden+this.hidden*OUTPUTS+o];}
    return out;
  }
  clone(){return new Brain(this.hidden,this.g);}
  static child(a,b){
    const hidden=a.hidden,g=new Float32Array(a.g.length),l=genomeLayout(hidden);
    for(let j=0;j<hidden;j++){
      const src=Math.random()<.5?a:b;
      for(let i=0;i<INPUTS;i++)g[j*INPUTS+i]=src.g[j*INPUTS+i];
      g[l.hiddenBiasBase+j]=src.g[l.hiddenBiasBase+j];
      for(let o=0;o<OUTPUTS;o++)g[l.outputWeightBase+o*hidden+j]=src.g[l.outputWeightBase+o*hidden+j];
    }
    for(let o=0;o<OUTPUTS;o++)g[l.outputBiasBase+o]=(Math.random()<.5?a:b).g[l.outputBiasBase+o];
    const referenceGenes=genomeLayout(4).count,scale=Math.sqrt(referenceGenes/g.length),mutationRate=Math.min(.06,.06*scale),resetRate=Math.min(.004,.004*scale);
    for(let i=0;i<g.length;i++){let v=g[i];if(Math.random()<mutationRate)v+=gaussian()*geneStd(hidden,i)*.5;if(Math.random()<resetRate)v=randomGene(hidden,i);g[i]=clamp(v,-4,4);}
    return new Brain(hidden,g);
  }
}

function makePopulation(hidden){return Array.from({length:POP_SIZE},()=>({brain:new Brain(hidden),fitness:0,best:0}));}
function evolvePopulation(pop){
  pop.sort((a,b)=>b.fitness-a.fitness);
  const next=[
    {brain:pop[0].brain.clone(),fitness:0,best:Math.max(pop[0].best,pop[0].fitness)},
    {brain:pop[1].brain.clone(),fitness:0,best:Math.max(pop[1].best,pop[1].fitness)}
  ];
  const pool=pop.slice(0,Math.max(4,Math.ceil(POP_SIZE*.5)));
  while(next.length<POP_SIZE){const a=pool[randi(pool.length)],b=pool[randi(pool.length)];next.push({brain:Brain.child(a.brain,b.brain),fitness:0,best:Math.max(a.best,b.best)});}
  return next;
}
function expandRestoredPopulation(pop){
  if(pop.length>POP_SIZE)return pop.slice(0,POP_SIZE);
  const parents=[...pop].sort((a,b)=>(b.best+b.fitness)-(a.best+a.fitness)).slice(0,Math.max(2,Math.ceil(pop.length/2)));
  while(pop.length<POP_SIZE){const a=parents[randi(parents.length)],b=parents[randi(parents.length)];pop.push({brain:Brain.child(a.brain,b.brain),fitness:0,best:Math.max(a.best,b.best)});}
  return pop;
}

class Agent{
  constructor(species,genotype,idx,x,y,facing=0){
    const initialAim=DIRS[facing]||DIRS[0];
    this.species=species;this.genotype=genotype;this.idx=idx;this.x=x;this.y=y;this.facing=facing;this.aimX=initialAim.x;this.aimY=initialAim.y;
    this.moveDir=-1;this.alive=true;this.health=1;this.cooldown=0;this.fitness=0;this.hits=0;this.kills=0;this.shots=0;
    this.finished=false;this.flash=0;this.lastX=x;this.lastY=y;this.deathTick=null;
    this.inputBuffer=new Float32Array(INPUTS);
    this.tacticalView={friends:[],enemies:[],friendlyProjectiles:[],enemyProjectiles:[]};
  }
}

function newBunker(x,y,w=55,h=35,id=null){return{id:id||'b'+Math.random().toString(36).slice(2),x,y,w,h,hp:1};}
function rectOverlap(a,b,pad=0){return a.x-pad<b.x+b.w+pad&&a.x+a.w+pad>b.x-pad&&a.y-pad<b.y+b.h+pad&&a.y+a.h+pad>b.y-pad;}
function bunkerInsideField(b,edge=0){return b.x>=FIELD.left+edge&&b.y>=FIELD.top+edge&&b.x+b.w<=FIELD.right-edge&&b.y+b.h<=FIELD.bottom-edge;}
function objectRadius(o){return Number.isFinite(o?.r)?o.r:AGENT_R;}
function bunkerClearOfObjects(b,objects,clearance=0){return objects.every(o=>!rectCircleHit(b,o,objectRadius(o)+clearance));}
function placeRandomBunkers(count,{prefix='B',orientation=0,minSize=44,maxSize=82,edgeMargin=28,gap=30,clearance=16,avoid=[],zone=null}={}){
  const z=zone||{left:FIELD.left+edgeMargin,right:FIELD.right-edgeMargin,top:FIELD.top+edgeMargin,bottom:FIELD.bottom-edgeMargin};
  for(let restart=0;restart<60;restart++){
    const out=[];
    for(let i=0;i<count;i++){
      let placed=false;
      for(let tries=0;tries<500&&!placed;tries++){
        const w=Math.round(rand(maxSize,minSize)),h=Math.round(rand(maxSize,minSize));
        if(z.right-z.left<w||z.bottom-z.top<h)continue;
        const x=rand(z.right-w,z.left),y=rand(z.bottom-h,z.top),b=orientedRect(x,y,w,h,orientation,prefix+(i+1));
        if(!bunkerInsideField(b,edgeMargin))continue;
        if(out.some(o=>rectOverlap(b,o,gap)))continue;
        if(!bunkerClearOfObjects(b,avoid,clearance))continue;
        out.push(b);placed=true;
      }
      if(!placed)break;
    }
    if(out.length===count)return out;
  }
  throw new Error(`Could not place ${count} legal ${prefix} bunkers.`);
}
function placeRoyaleBunkers(){
  const avoid=sim.agents;
  for(let restart=0;restart<80;restart++){
    const out=[];
    for(let ring=0;ring<2;ring++){
      let placed=false;
      for(let tries=0;tries<300&&!placed;tries++){
        const size=Math.round(rand(68,46)),radius=rand(ring?175:135,ring?135:95),phase=rand(TAU/3,0),triplet=[];
        for(let k=0;k<3;k++){const a=phase+k*TAU/3,cx=FIELD.cx+Math.cos(a)*radius,cy=FIELD.cy+Math.sin(a)*radius;triplet.push(newBunker(cx-size/2,cy-size/2,size,size,`R${ring*3+k+1}`));}
        if(triplet.some(b=>!bunkerInsideField(b,30)||!bunkerClearOfObjects(b,avoid,18)))continue;
        if(triplet.some((b,i)=>triplet.some((o,j)=>i!==j&&rectOverlap(b,o,28))))continue;
        if(triplet.some(b=>out.some(o=>rectOverlap(b,o,28))))continue;
        out.push(...triplet);placed=true;
      }
      if(!placed)break;
    }
    if(out.length===6)return out;
  }
  throw new Error('Could not place legal symmetric Battle Royale cover.');
}
function readBrainSize(id,fallback){const el=document.getElementById(id),n=Number(el&&el.value);return Number.isFinite(n)?clamp(Math.round(n),MIN_HIDDEN,MAX_HIDDEN):fallback;}
function blankRounds(){return{target:0,battlefield:0,invaders:0,royale:0};}

function createSimulation(mode,generation=1){return{mode,generation,trial:1,tick:0,orientation:0,agents:[],projectiles:[],bunkers:[],targets:[],invaders:[],arrows:[],populations:{},bestEver:{red:-Infinity,green:-Infinity,blue:-Infinity},winner:null,endReason:'',lastSummary:'No completed rounds yet.',invaderCleared:{red:false,green:false,blue:false},invaderBreached:{red:false,green:false,blue:false},lifetime:makeLifetimeStats(),lifetimeRounds:blankRounds(),roundLifetimeBaseline:null,pendingMode:null,clockPhase:Math.random()*TAU,battlefieldLanes:[],nextArrowTick:0};}

function initSimulation(){
  const h={red:readBrainSize('brain-red',4),green:readBrainSize('brain-green',10),blue:readBrainSize('brain-blue',20)};
  sim=createSimulation(selectedMode,1);
  for(const s of SPECIES)sim.populations[s.id]=makePopulation(h[s.id]);
  setupGeneration();setRunningUI(true);
  if(typeof saveExperiment==='function')saveExperiment();
}

function restoreSimulation(snapshot,modeOverride=selectedMode){
  if(!snapshot||snapshot.schema!==4)throw new Error('Unsupported BattlEvo save data.');
  const restoredMode=MODE_CONFIG[modeOverride]?modeOverride:(MODE_CONFIG[snapshot.mode]?snapshot.mode:'target');
  selectedMode=restoredMode;
  sim=createSimulation(restoredMode,Math.max(1,Number(snapshot.generation)||1));
  sim.trial=1;
  sim.lifetime=snapshot.lifetime||makeLifetimeStats();
  sim.lifetimeRounds=Object.assign(blankRounds(),snapshot.lifetimeRounds||{});
  sim.bestEver=Object.assign({red:-Infinity,green:-Infinity,blue:-Infinity},snapshot.bestEver||{});
  for(const s of SPECIES){
    const rows=snapshot.populations&&snapshot.populations[s.id];
    if(!Array.isArray(rows)||rows.length<2)throw new Error('Saved population is incomplete.');
    const restored=rows.map(row=>({brain:new Brain(clamp(Math.round(row.hidden),MIN_HIDDEN,MAX_HIDDEN),row.genome),fitness:0,best:Number(row.best)||0}));
    sim.populations[s.id]=expandRestoredPopulation(restored);
    for(const g of sim.populations[s.id])g.fitness=0;
  }
  setupGeneration();setRunningUI(true);paused=true;
}

function setupGeneration(){
  sim.tick=0;sim.projectiles=[];sim.arrows=[];sim.targets=[];sim.invaders=[];sim.bunkers=[];sim.agents=[];sim.winner=null;sim.endReason='';sim.invaderCleared={red:false,green:false,blue:false};sim.invaderBreached={red:false,green:false,blue:false};sim.clockPhase=Math.random()*TAU;
  sim.orientation=randi(4);
  if(sim.mode==='target')setupTarget();
  else if(sim.mode==='battlefield')setupBattlefield();
  else if(sim.mode==='invaders')setupInvaders();
  else setupRoyale();
  sim.roundLifetimeBaseline=cloneLifetimeStats(sim.lifetime);
  if(typeof updateHud==='function')updateHud();
}

function spawnSpeciesAgents(spawnFn){
  for(const s of SPECIES){const pop=sim.populations[s.id],slots=shuffledIndices(POP_SIZE);pop.forEach((g,i)=>{const p=spawnFn(s,slots[i]);sim.agents.push(new Agent(s,g,i,p.x,p.y,p.facing===undefined?randi(8):p.facing));});}
}

function setupBattlefield(){
  const o=sim.orientation,facings=Array.from({length:POP_SIZE},()=>orientedFacing(6,o));
  spawnSpeciesAgents((s,slot)=>{const baseX=FIELD.left+32+slot*((FIELD.size-64)/(POP_SIZE-1)),p=orientedPoint(baseX,FIELD.bottom-28,o);return{x:p.x,y:p.y,facing:facings[slot]};});
  sim.bunkers=placeRandomBunkers(4,{prefix:'B',orientation:o,minSize:46,maxSize:82,edgeMargin:30,gap:34,clearance:18,avoid:sim.agents});
  sim.battlefieldLanes=Array.from({length:8},(_,i)=>clamp(55+i*70+randi(21)-10,42,558));
  sim.nextArrowTick=22+randi(20);
}

function invaderFireSeed(row,col,count,generation){return 90+((row*31+col*47+count*53+generation*17)%120);}
function setupInvaders(){
  const o=sim.orientation;
  spawnSpeciesAgents((s,slot)=>{const baseX=FIELD.left+35+slot*((FIELD.size-70)/(POP_SIZE-1)),p=orientedPoint(baseX,FIELD.bottom-35,o);return{x:p.x,y:p.y,facing:orientedFacing(6,o)};});
  for(let r=0;r<3;r++)for(let c=0;c<7;c++){
    const p=orientedPoint(FIELD.left+90+c*70,70+r*45,o),initial=60+((r*29+c*43+sim.generation*13+sim.trial*7)%120);
    sim.invaders.push({x:p.x,y:p.y,r:9,row:r,col:c,alive:true,aliveFor:{red:true,green:true,blue:true},shuffle:1,fireClockFor:{red:initial,green:initial,blue:initial},fireCountFor:{red:0,green:0,blue:0},flash:0,vx:0,vy:0});
  }
  const zone={left:FIELD.left+45,right:FIELD.right-45,top:FIELD.top+300,bottom:FIELD.top+470};
  sim.bunkers=placeRandomBunkers(3,{prefix:'I',orientation:o,minSize:52,maxSize:88,edgeMargin:30,gap:34,clearance:16,avoid:[...sim.agents,...sim.invaders],zone});
}

function setupRoyale(){
  sim.orientation=0;sim.bunkers=[];
  const phase=randi(6)*TAU/6,homes={};
  SPECIES.forEach((s,i)=>{const a=phase+i*TAU/3,x=FIELD.cx+Math.cos(a)*230,y=FIELD.cy+Math.sin(a)*230;homes[s.id]={x,y,f:vecToDir(FIELD.cx-x,FIELD.cy-y)};});
  spawnSpeciesAgents((s,slot)=>{const h=homes[s.id],angle=slot/POP_SIZE*TAU,rad=22+(slot%4)*9;return{x:h.x+Math.cos(angle)*rad,y:h.y+Math.sin(angle)*rad,facing:h.f};});
  sim.bunkers=placeRoyaleBunkers();
}
