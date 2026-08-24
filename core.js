'use strict';

// BattlEvo v0.2.0 — dependency-free neural evolution arcade.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const TAU = Math.PI * 2;
const DIRS = Array.from({length:8},(_,i)=>({x:Math.cos(i*Math.PI/4), y:Math.sin(i*Math.PI/4)}));
const SPECIES = [
  {id:'red', color:'#ff4a4a', pale:'#ffaaaa'},
  {id:'green', color:'#45e06f', pale:'#a8f5bc'},
  {id:'blue', color:'#4f8cff', pale:'#a9c7ff'}
];
const POP_SIZE = 12;
const AGENT_SPEED = 1.65;
const PROJECTILE_SPEED = 4.6;
const AGENT_R = 7;

// The display is wide, but gameplay happens inside one centred square. Rotating a
// scenario therefore changes only direction — not travel distance, dodge room,
// bunker geometry or time-to-breach.
const FIELD_SIZE = H;
const FIELD = {
  left:(W-FIELD_SIZE)/2,
  right:(W+FIELD_SIZE)/2,
  top:0,
  bottom:H,
  size:FIELD_SIZE,
  cx:W/2,
  cy:H/2
};
const SIGHT_RANGE = Math.hypot(FIELD_SIZE,FIELD_SIZE) + 1;
const INPUTS = 77;
const OUTPUTS = 18; // 9 movement (stay + 8 dirs), 8 facing, 1 fire.
const MAX_TICKS = {target:1800, battlefield:1500, invaders:1800, royale:2100};
const MODE_NAMES = {target:'Target Practice', battlefield:'Battlefield Run', invaders:'Invaders', royale:'Battle Royale'};

let sim = null;
let selectedMode = 'target';
let speed = 1;
let paused = false;
let last = performance.now();

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a=1,b=0){ return b + Math.random()*(a-b); }
function randi(n){ return Math.floor(Math.random()*n); }
function dist2(a,b){ const dx=a.x-b.x,dy=a.y-b.y; return dx*dx+dy*dy; }
function normAngle(a){ while(a<=-Math.PI)a+=TAU; while(a>Math.PI)a-=TAU; return a; }
function dot(ax,ay,bx,by){ return ax*bx+ay*by; }
function gaussian(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(TAU*v); }
function circleHit(a,b,ra,rb){ return dist2(a,b) <= (ra+rb)*(ra+rb); }
function rectCircleHit(r,c,cr){ const px=clamp(c.x,r.x,r.x+r.w), py=clamp(c.y,r.y,r.y+r.h); const dx=c.x-px,dy=c.y-py; return dx*dx+dy*dy<=cr*cr; }
function vecToDir(x,y){ if(Math.abs(x)<.001&&Math.abs(y)<.001)return -1; let a=Math.atan2(y,x); if(a<0)a+=TAU; return Math.round(a/(Math.PI/4))%8; }
function shuffledIndices(n){ const a=Array.from({length:n},(_,i)=>i); for(let i=n-1;i>0;i--){const j=randi(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }
function speciesOffset(s,amount=14){ return (SPECIES.findIndex(x=>x.id===s.id)-1)*amount; }
function inArenaPoint(p,margin=0){ return p.x>=FIELD.left-margin&&p.x<=FIELD.right+margin&&p.y>=FIELD.top-margin&&p.y<=FIELD.bottom+margin; }

// Screen-coordinate clockwise rotations around the square field centre.
function orientedPoint(x,y,o){
  const dx=x-FIELD.cx,dy=y-FIELD.cy;
  if(o===0)return{x,y};
  if(o===1)return{x:FIELD.cx-dy,y:FIELD.cy+dx};
  if(o===2)return{x:FIELD.cx-dx,y:FIELD.cy-dy};
  return{x:FIELD.cx+dy,y:FIELD.cy-dx};
}
function orientedRect(x,y,w,h,o,id){
  const c=orientedPoint(x+w/2,y+h/2,o),odd=o%2===1;
  const rw=odd?h:w,rh=odd?w:h;
  return newBunker(c.x-rw/2,c.y-rh/2,rw,rh,id);
}
function orientedFacing(baseDir,o){ return (baseDir+o*2)%8; }

class Brain {
  constructor(hidden, genome=null){
    this.hidden=hidden;
    const count = INPUTS*hidden + hidden + hidden*OUTPUTS + OUTPUTS;
    this.g = genome ? Float32Array.from(genome) : Float32Array.from({length:count},()=>gaussian()*0.45);
  }
  run(input){
    const h=new Float32Array(this.hidden); let k=0;
    for(let j=0;j<this.hidden;j++){
      let s=0; for(let i=0;i<INPUTS;i++) s += input[i]*this.g[k++];
      h[j]=Math.tanh(s + this.g[INPUTS*this.hidden+j]);
    }
    k=INPUTS*this.hidden+this.hidden;
    const out=new Float32Array(OUTPUTS);
    for(let o=0;o<OUTPUTS;o++){
      let s=0; for(let j=0;j<this.hidden;j++) s+=h[j]*this.g[k++];
      out[o]=s + this.g[INPUTS*this.hidden+this.hidden+this.hidden*OUTPUTS+o];
    }
    return out;
  }
  clone(){ return new Brain(this.hidden,this.g); }
  static child(a,b){
    const hidden=a.hidden,g=new Float32Array(a.g.length);
    const hiddenBiasBase=INPUTS*hidden;
    const outputWeightBase=hiddenBiasBase+hidden;
    const outputBiasBase=outputWeightBase+hidden*OUTPUTS;

    // Crossover whole hidden units rather than shredding each neuron's incoming and
    // outgoing weights independently. This preserves useful evolved subcircuits better.
    for(let j=0;j<hidden;j++){
      const src=Math.random()<0.5?a:b;
      for(let i=0;i<INPUTS;i++)g[j*INPUTS+i]=src.g[j*INPUTS+i];
      g[hiddenBiasBase+j]=src.g[hiddenBiasBase+j];
      for(let o=0;o<OUTPUTS;o++)g[outputWeightBase+o*hidden+j]=src.g[outputWeightBase+o*hidden+j];
    }
    for(let o=0;o<OUTPUTS;o++)g[outputBiasBase+o]=(Math.random()<0.5?a:b).g[outputBiasBase+o];

    // Scale mutation sub-linearly with genome size so a larger brain explores more
    // parameters without being genetically scrambled simply for having more capacity.
    const referenceGenes=INPUTS*4+4+4*OUTPUTS+OUTPUTS;
    const scale=Math.sqrt(referenceGenes/g.length);
    const mutationRate=Math.min(0.06,0.06*scale);
    const resetRate=Math.min(0.004,0.004*scale);
    for(let i=0;i<g.length;i++){
      let v=g[i];
      if(Math.random()<mutationRate)v+=gaussian()*0.28;
      if(Math.random()<resetRate)v=gaussian()*0.6;
      g[i]=clamp(v,-4,4);
    }
    return new Brain(hidden,g);
  }
}

function makePopulation(hidden){ return Array.from({length:POP_SIZE},()=>({brain:new Brain(hidden),fitness:0,best:0})); }
function evolvePopulation(pop){
  pop.sort((a,b)=>b.fitness-a.fitness);
  const next=[];
  next.push({brain:pop[0].brain.clone(),fitness:0,best:Math.max(pop[0].best,pop[0].fitness)});
  next.push({brain:pop[1].brain.clone(),fitness:0,best:Math.max(pop[1].best,pop[1].fitness)});
  const pool=pop.slice(0,Math.max(4,Math.ceil(POP_SIZE*.5)));
  while(next.length<POP_SIZE){
    const a=pool[randi(pool.length)], b=pool[randi(pool.length)];
    next.push({brain:Brain.child(a.brain,b.brain),fitness:0,best:Math.max(a.best,b.best)});
  }
  return next;
}

class Agent {
  constructor(species, genotype, idx, x, y, facing=0){
    this.species=species; this.genotype=genotype; this.idx=idx; this.x=x; this.y=y; this.facing=facing;
    this.moveDir=-1; this.alive=true; this.health=1; this.cooldown=0; this.fitness=0; this.hits=0; this.kills=0; this.shots=0;
    this.memory=new Map(); this.finished=false; this.flash=0; this.lastX=x; this.lastY=y; this.deathTick=null;
  }
}

function newBunker(x,y,w=55,h=35,id=null){ return {id:id||'b'+Math.random().toString(36).slice(2),x,y,w,h,hp:1}; }

function initSimulation(){
  const h={
    red:clamp(parseInt(document.getElementById('brain-red').value)||4,1,64),
    green:clamp(parseInt(document.getElementById('brain-green').value)||10,1,64),
    blue:clamp(parseInt(document.getElementById('brain-blue').value)||20,1,64)
  };
  sim={mode:selectedMode,generation:1,tick:0,orientation:0,agents:[],projectiles:[],bunkers:[],targets:[],invaders:[],arrows:[],populations:{},bestEver:{red:-Infinity,green:-Infinity,blue:-Infinity},winner:null,endReason:'',lastSummary:'No completed rounds yet.',invaderCleared:{red:false,green:false,blue:false}};
  for(const s of SPECIES)sim.populations[s.id]=makePopulation(h[s.id]);
  setupGeneration();
  setRunningUI(true);
}

function setupGeneration(){
  sim.tick=0;sim.projectiles=[];sim.arrows=[];sim.targets=[];sim.invaders=[];sim.bunkers=[];sim.agents=[];sim.winner=null;sim.endReason='';sim.invaderCleared={red:false,green:false,blue:false};
  sim.orientation=randi(4);
  if(sim.mode==='target')setupTarget();
  if(sim.mode==='battlefield')setupBattlefield();
  if(sim.mode==='invaders')setupInvaders();
  if(sim.mode==='royale')setupRoyale();
  updateHud();
}

// Genotype index and physical spawn slot are deliberately decoupled. Elites do not inherit
// a permanently favourable lane/position just because evolution sorted them to index 0 or 1.
function spawnSpeciesAgents(spawnFn){
  for(const s of SPECIES){
    const pop=sim.populations[s.id],slots=shuffledIndices(POP_SIZE);
    pop.forEach((g,i)=>{const p=spawnFn(s,slots[i]);sim.agents.push(new Agent(s,g,i,p.x,p.y,p.facing??randi(8)));});
  }
}

function setupTarget(){
  sim.orientation=0;
  sim.bunkers=[
    newBunker(FIELD.left+105,145,72,38,'T1'),
    newBunker(FIELD.left+390,365,78,38,'T2'),
    newBunker(FIELD.left+270,255,60,60,'T3')
  ];
  spawnSpeciesAgents((s,slot)=>({
    x:FIELD.left+35+slot*((FIELD.size-70)/(POP_SIZE-1))+speciesOffset(s),
    y:FIELD.bottom-28,
    facing:6
  }));
  const L=FIELD.left;
  const paths=[
    {x:L+75,y:85,dx:1,dy:0},{x:L+525,y:120,dx:-1,dy:0},
    {x:L+100,y:285,dx:1,dy:1},{x:L+500,y:250,dx:-1,dy:1},
    {x:L+270,y:80,dx:0,dy:1},{x:L+335,y:465,dx:0,dy:-1}
  ];
  sim.targets=paths.map((p,i)=>({...p,id:i,r:9,speed:AGENT_SPEED,phase:Math.random()*TAU,hitFlash:0}));
}

function setupBattlefield(){
  const o=sim.orientation;
  const base=[
    [FIELD.left+70,145,76,36,'B1'],
    [FIELD.left+365,245,88,38,'B2'],
    [FIELD.left+190,390,72,36,'B3'],
    [FIELD.left+455,455,70,36,'B4']
  ];
  sim.bunkers=base.map(b=>orientedRect(b[0],b[1],b[2],b[3],o,b[4]));
  spawnSpeciesAgents((s,slot)=>{
    const baseX=FIELD.left+32+slot*((FIELD.size-64)/(POP_SIZE-1))+speciesOffset(s);
    const p=orientedPoint(baseX,FIELD.bottom-28,o);
    return{x:p.x,y:p.y,facing:orientedFacing(6,o)};
  });
}

function setupInvaders(){
  const o=sim.orientation;
  const baseBunkers=[
    [FIELD.left+75,400,86,34,'I1'],
    [FIELD.left+257,400,86,34,'I2'],
    [FIELD.left+439,400,86,34,'I3']
  ];
  sim.bunkers=baseBunkers.map(b=>orientedRect(b[0],b[1],b[2],b[3],o,b[4]));
  spawnSpeciesAgents((s,slot)=>{
    const baseX=FIELD.left+35+slot*((FIELD.size-70)/(POP_SIZE-1))+speciesOffset(s);
    const p=orientedPoint(baseX,FIELD.bottom-35,o);
    return{x:p.x,y:p.y,facing:orientedFacing(6,o)};
  });
  const cols=7,rows=3;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const p=orientedPoint(FIELD.left+90+c*70,70+r*45,o);
    sim.invaders.push({x:p.x,y:p.y,r:9,row:r,col:c,alive:true,aliveFor:{red:true,green:true,blue:true},shuffle:1,fireClock:60+randi(120),flash:0,vx:0,vy:0});
  }
}

function setupRoyale(){
  sim.orientation=0;
  sim.bunkers=[];
  for(let i=0;i<6;i++){
    const a=i*TAU/6,cx=FIELD.cx+Math.cos(a)*155,cy=FIELD.cy+Math.sin(a)*155;
    sim.bunkers.push(newBunker(cx-27,cy-27,54,54,'R'+(i+1)));
  }
  sim.bunkers.push(newBunker(FIELD.cx-34,FIELD.cy-34,68,68,'RC'));

  // Three equally spaced team homes on a circle. The six-way phase randomisation rotates
  // colours through equivalent map positions while preserving exact team-to-team distances.
  const phase=randi(6)*TAU/6,homes={};
  SPECIES.forEach((s,i)=>{
    const a=phase+i*TAU/3,x=FIELD.cx+Math.cos(a)*230,y=FIELD.cy+Math.sin(a)*230;
    homes[s.id]={x,y,f:vecToDir(FIELD.cx-x,FIELD.cy-y)};
  });
  spawnSpeciesAgents((s,slot)=>{
    const h=homes[s.id],angle=(slot/POP_SIZE)*TAU,rad=18+(slot%3)*8;
    return{x:h.x+Math.cos(angle)*rad,y:h.y+Math.sin(angle)*rad,facing:h.f};
  });
}
