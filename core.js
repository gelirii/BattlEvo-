'use strict';

// BattlEvo v0.1 — dependency-free neural evolution arcade.
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
function randomEdgePoint(m=30){ const e=randi(4); if(e===0)return{x:rand(W-m,m),y:m}; if(e===1)return{x:W-m,y:rand(H-m,m)}; if(e===2)return{x:rand(W-m,m),y:H-m}; return{x:m,y:rand(H-m,m)}; }

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
    const g=new Float32Array(a.g.length);
    for(let i=0;i<g.length;i++){
      let v=Math.random()<0.5?a.g[i]:b.g[i];
      if(Math.random()<0.085) v += gaussian()*0.28;
      if(Math.random()<0.006) v = gaussian()*0.6;
      g[i]=clamp(v,-4,4);
    }
    return new Brain(a.hidden,g);
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
    this.memory=new Map(); this.finished=false; this.flash=0; this.lastX=x; this.lastY=y;
  }
}

function newBunker(x,y,w=55,h=35,id=null){ return {id:id||'b'+Math.random().toString(36).slice(2),x,y,w,h,hp:1}; }

function initSimulation(){
  const h={
    red:clamp(parseInt(document.getElementById('brain-red').value)||4,1,64),
    green:clamp(parseInt(document.getElementById('brain-green').value)||10,1,64),
    blue:clamp(parseInt(document.getElementById('brain-blue').value)||20,1,64)
  };
  sim={mode:selectedMode,generation:1,tick:0,orientation:0,agents:[],projectiles:[],bunkers:[],targets:[],invaders:[],arrows:[], populations:{}, bestEver:{red:-Infinity,green:-Infinity,blue:-Infinity}, winner:null, endReason:''};
  for(const s of SPECIES) sim.populations[s.id]=makePopulation(h[s.id]);
  setupGeneration();
  setRunningUI(true);
}

function setupGeneration(){
  sim.tick=0; sim.projectiles=[]; sim.arrows=[]; sim.targets=[]; sim.invaders=[]; sim.bunkers=[]; sim.agents=[]; sim.winner=null; sim.endReason='';
  sim.orientation=randi(4); // 0 up, 1 right, 2 down, 3 left — objective/defended edge context.
  if(sim.mode==='target') setupTarget();
  if(sim.mode==='battlefield') setupBattlefield();
  if(sim.mode==='invaders') setupInvaders();
  if(sim.mode==='royale') setupRoyale();
  updateHud();
}

function spawnSpeciesAgents(spawnFn){
  for(const s of SPECIES){
    const pop=sim.populations[s.id];
    pop.forEach((g,i)=>{
      const p=spawnFn(s,i); sim.agents.push(new Agent(s,g,i,p.x,p.y,p.facing??randi(8)));
    });
  }
}

function setupTarget(){
  sim.orientation=randi(4);
  sim.bunkers=[newBunker(250,170,75,38,'T1'),newBunker(625,390,80,38,'T2'),newBunker(445,270,60,60,'T3')];
  spawnSpeciesAgents((s,i)=>{
    const band=SPECIES.findIndex(x=>x.id===s.id);
    return {x:120+band*360 + (i%4)*18, y:500-Math.floor(i/4)*22, facing:6};
  });
  const paths=[
    {x:130,y:95,dx:1,dy:0},{x:820,y:130,dx:-1,dy:0},{x:160,y:300,dx:1,dy:1},{x:800,y:260,dx:-1,dy:1},
    {x:470,y:105,dx:0,dy:1},{x:520,y:470,dx:0,dy:-1}
  ];
  sim.targets=paths.map((p,i)=>({...p,id:i,r:9,speed:AGENT_SPEED,phase:Math.random()*TAU,hitFlash:0}));
}

function setupBattlefield(){
  const vertical = sim.orientation===0||sim.orientation===2;
  sim.bunkers = vertical ? [newBunker(180,170,75,36,'B1'),newBunker(540,270,90,38,'B2'),newBunker(300,410,70,36,'B3'),newBunker(735,455,70,36,'B4')]
                         : [newBunker(210,120,38,78,'B1'),newBunker(385,360,38,90,'B2'),newBunker(585,180,38,75,'B3'),newBunker(760,390,38,75,'B4')];
  spawnSpeciesAgents((s,i)=>{
    const lane=(i+SPECIES.findIndex(x=>x.id===s.id)*4)%POP_SIZE;
    if(sim.orientation===0) return{x:70+lane*(820/(POP_SIZE-1)),y:H-28,facing:6};
    if(sim.orientation===2) return{x:70+lane*(820/(POP_SIZE-1)),y:28,facing:2};
    if(sim.orientation===1) return{x:28,y:55+lane*(490/(POP_SIZE-1)),facing:0};
    return{x:W-28,y:55+lane*(490/(POP_SIZE-1)),facing:4};
  });
}

function setupInvaders(){
  const vertical=sim.orientation===0||sim.orientation===2;
  sim.bunkers = vertical ? [newBunker(160,395,90,34,'I1'),newBunker(435,395,90,34,'I2'),newBunker(710,395,90,34,'I3')]
                         : [newBunker(515,100,34,90,'I1'),newBunker(515,255,34,90,'I2'),newBunker(515,410,34,90,'I3')];
  spawnSpeciesAgents((s,i)=>{
    const lane=(i+SPECIES.findIndex(x=>x.id===s.id)*3)%POP_SIZE;
    if(sim.orientation===0)return{x:85+lane*70,y:H-35,facing:6};
    if(sim.orientation===2)return{x:85+lane*70,y:35,facing:2};
    if(sim.orientation===1)return{x:35,y:55+lane*43,facing:0};
    return{x:W-35,y:55+lane*43,facing:4};
  });
  const cols=7,rows=3;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    let x,y;
    if(sim.orientation===0){x=230+c*85;y=80+r*48;}
    if(sim.orientation===2){x=230+c*85;y=H-80-r*48;}
    if(sim.orientation===1){x=W-80-r*48;y=140+c*52;}
    if(sim.orientation===3){x=80+r*48;y=140+c*52;}
    sim.invaders.push({x,y,r:9,row:r,col:c,alive:true,shuffle:1,fireClock:randi(140),flash:0,vx:0,vy:0});
  }
}

function setupRoyale(){
  sim.orientation=0;
  sim.bunkers=[newBunker(210,125,85,40,'R1'),newBunker(665,125,85,40,'R2'),newBunker(210,435,85,40,'R3'),newBunker(665,435,85,40,'R4'),newBunker(440,270,80,60,'R5')];
  const homes={red:{x:90,y:300,f:0},green:{x:480,y:65,f:2},blue:{x:870,y:300,f:4}};
  spawnSpeciesAgents((s,i)=>{
    const h=homes[s.id], angle=(i/POP_SIZE)*TAU, rad=25+(i%3)*12;
    return{x:h.x+Math.cos(angle)*rad,y:h.y+Math.sin(angle)*rad,facing:h.f};
  });
}
