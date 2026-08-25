'use strict';

function objectiveVector(agent){
  if(sim.mode==='battlefield'){
    if(sim.orientation===0)return{x:0,y:-1,progress:clamp((FIELD.bottom-agent.y)/FIELD.size,0,1)};
    if(sim.orientation===2)return{x:0,y:1,progress:clamp((agent.y-FIELD.top)/FIELD.size,0,1)};
    if(sim.orientation===1)return{x:1,y:0,progress:clamp((agent.x-FIELD.left)/FIELD.size,0,1)};
    return{x:-1,y:0,progress:clamp((FIELD.right-agent.x)/FIELD.size,0,1)};
  }
  if(sim.mode==='invaders'){
    if(sim.orientation===0)return{x:0,y:-1,progress:0};
    if(sim.orientation===2)return{x:0,y:1,progress:0};
    if(sim.orientation===1)return{x:1,y:0,progress:0};
    return{x:-1,y:0,progress:0};
  }
  return{x:0,y:0,progress:0};
}
function inFront(agent,obj){const dx=obj.x-agent.x,dy=obj.y-agent.y,f=DIRS[agent.facing];return dot(dx,dy,f.x,f.y)>=0;}
function segmentIntersectsRect(x1,y1,x2,y2,r){
  const dx=x2-x1,dy=y2-y1;let t0=0,t1=1;
  const clip=(p,q)=>{if(Math.abs(p)<1e-9)return q>=0;const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}return true;};
  return clip(-dx,x1-r.x)&&clip(dx,r.x+r.w-x1)&&clip(-dy,y1-r.y)&&clip(dy,r.y+r.h-y1);
}
function lineOfSight(agent,obj,ignoreBunkerId=null){
  if(!inFront(agent,obj))return false;
  for(const b of sim.bunkers){if(b.id===ignoreBunkerId)continue;if(segmentIntersectsRect(agent.x,agent.y,obj.x,obj.y,b))return false;}
  return true;
}
function rememberVisibleBunkers(agent){for(const b of sim.bunkers){const centre={x:b.x+b.w/2,y:b.y+b.h/2};if(lineOfSight(agent,centre,b.id))agent.memory.set(b.id,{x:centre.x,y:centre.y,w:b.w,h:b.h,seen:sim.tick});}}
function sensorSector(a,o,ignoreBunkerId=null){
  if(!lineOfSight(a,o,ignoreBunkerId))return-1;
  const dx=o.x-a.x,dy=o.y-a.y;if(dx*dx+dy*dy<1)return-1;
  const f=DIRS[a.facing],ang=normAngle(Math.atan2(dy,dx)-Math.atan2(f.y,f.x));
  return clamp(Math.floor(((ang+Math.PI/2)/Math.PI)*7),0,6);
}
function proximity(a,o){return clamp(1-Math.hypot(o.x-a.x,o.y-a.y)/SIGHT_RANGE,0,1);}
function relativeVelocity(a,vx,vy,scale){const f=DIRS[a.facing],right={x:-f.y,y:f.x};return{forward:clamp(dot(vx,vy,f.x,f.y)/scale,-1,1),side:clamp(dot(vx,vy,right.x,right.y)/scale,-1,1)};}
function addEnemyInput(a,sectors,o,vx=0,vy=0){const s=sensorSector(a,o);if(s<0)return;const near=proximity(a,o),base=s*8;if(near>sectors[base]){const rv=relativeVelocity(a,vx,vy,AGENT_SPEED);sectors[base]=near;sectors[base+1]=rv.forward;sectors[base+2]=rv.side;}}
function addFriendInput(a,sectors,o){const s=sensorSector(a,o);if(s>=0)sectors[s*8+3]=Math.max(sectors[s*8+3],proximity(a,o));}
function addProjectileInput(a,sectors,o){const s=sensorSector(a,o);if(s<0)return;const near=proximity(a,o),base=s*8+4;if(near>sectors[base]){const rv=relativeVelocity(a,o.vx||0,o.vy||0,PROJECTILE_SPEED);sectors[base]=near;sectors[base+1]=rv.forward;sectors[base+2]=rv.side;}}
function addBunkerInput(a,sectors,b){const o={x:b.x+b.w/2,y:b.y+b.h/2},s=sensorSector(a,o,b.id);if(s>=0)sectors[s*8+7]=Math.max(sectors[s*8+7],proximity(a,o));}

function buildInputs(a){
  rememberVisibleBunkers(a);
  const input=a.inputBuffer,sectors=a.sectorBuffer,mem=a.memoryBuffer;input.fill(0);sectors.fill(0);mem.fill(0);let k=0;
  const f=DIRS[a.facing],mv=a.moveDir>=0?DIRS[a.moveDir]:{x:0,y:0};
  input[k++]=a.health;input[k++]=a.cooldown<=0?1:0;input[k++]=f.x;input[k++]=f.y;input[k++]=mv.x;input[k++]=mv.y;
  const obj=objectiveVector(a);input[k++]=obj.x;input[k++]=obj.y;input[k++]=obj.progress;

  if(sim.mode==='royale'){
    for(const o of sim.agents){
      if(o===a||!o.alive)continue;
      if(o.species.id===a.species.id)addFriendInput(a,sectors,o);
      else{const d=o.moveDir>=0?DIRS[o.moveDir]:{x:0,y:0};addEnemyInput(a,sectors,o,d.x*AGENT_SPEED,d.y*AGENT_SPEED);}
    }
  }
  for(const p of sim.projectiles){
    if(p.dead||p.owner===a)continue;
    if(p.targetTeam&&p.targetTeam!==a.species.id)continue;
    const hostile=sim.mode==='royale'?p.team!==a.species.id:p.team==='invader';
    if(hostile)addProjectileInput(a,sectors,p);
  }
  for(const p of sim.arrows)if(!p.dead)addProjectileInput(a,sectors,p);
  for(const b of sim.bunkers)addBunkerInput(a,sectors,b);
  if(sim.mode==='target')for(const t of sim.targets)if(targetActiveFor(t,a.species.id)){const len=Math.hypot(t.dx||0,t.dy||0)||1;addEnemyInput(a,sectors,t,(t.dx||0)/len*t.speed,(t.dy||0)/len*t.speed);}
  if(sim.mode==='invaders')for(const n of sim.invaders)if(n.aliveFor?.[a.species.id])addEnemyInput(a,sectors,n,n.vx||0,n.vy||0);
  for(let i=0;i<sectors.length;i++)input[k++]=sectors[i];

  for(const m of a.memory.values()){
    const dx=m.x-a.x,dy=m.y-a.y,d=Math.hypot(dx,dy),rel=normAngle(Math.atan2(dy,dx)-Math.atan2(f.y,f.x)),sector=(Math.round(rel/(Math.PI/4))+8)%8;
    mem[sector]=Math.max(mem[sector],clamp(1-d/SIGHT_RANGE,0,1));
  }
  for(let i=0;i<mem.length;i++)input[k++]=mem[i];
  input[k++]=clamp((a.x-FIELD.cx)/(FIELD.size/2),-1,1);input[k++]=clamp((a.y-FIELD.cy)/(FIELD.size/2),-1,1);
  const clock=sim.tick*.025+sim.clockPhase;input[k++]=Math.sin(clock);input[k++]=Math.cos(clock);
  return input;
}

function chooseAction(a){const out=a.genotype.brain.run(buildInputs(a));let mi=0;for(let i=1;i<9;i++)if(out[i]>out[mi])mi=i;a.moveDir=mi===0?-1:mi-1;let fi=9;for(let i=10;i<17;i++)if(out[i]>out[fi])fi=i;a.facing=fi-9;return out[17]>.15;}
function tryMove(a){
  if(a.moveDir<0)return;let d=DIRS[a.moveDir];
  if(sim.mode==='invaders'){const horizontal=sim.orientation===0||sim.orientation===2;d=horizontal?{x:Math.sign(d.x),y:0}:{x:0,y:Math.sign(d.y)};if(d.x===0&&d.y===0)return;}
  const nx=clamp(a.x+d.x*AGENT_SPEED,FIELD.left+AGENT_R,FIELD.right-AGENT_R),ny=clamp(a.y+d.y*AGENT_SPEED,FIELD.top+AGENT_R,FIELD.bottom-AGENT_R),test={x:nx,y:ny};
  if(sim.bunkers.some(b=>rectCircleHit(b,test,AGENT_R)))return;
  if(sim.mode==='royale'&&sim.agents.some(o=>o!==a&&o.alive&&dist2(test,o)<(AGENT_R*2)*(AGENT_R*2)))return;
  a.x=nx;a.y=ny;
}
function fire(a){if(a.cooldown>0||!a.alive)return;const d=DIRS[a.facing];a.cooldown=24;a.shots++;sim.projectiles.push({x:a.x+d.x*11,y:a.y+d.y*11,vx:d.x*PROJECTILE_SPEED,vy:d.y*PROJECTILE_SPEED,owner:a,team:a.species.id,r:2.5,dead:false});a.fitness-=SHOT_COST[sim.mode]||0;}
function stepAgents(){for(const a of sim.agents){if(!a.alive)continue;a.lastX=a.x;a.lastY=a.y;const wantsFire=chooseAction(a);tryMove(a);if(wantsFire&&sim.mode!=='battlefield')fire(a);if(a.cooldown>0)a.cooldown--;if(a.flash>0)a.flash--;a.fitness+=.002;}}

function projectileBlocked(p){return sim.bunkers.some(b=>rectCircleHit(b,p,p.r));}
function projectileOutOfArena(p){return!inArenaPoint(p,12);}
function killAgent(a,by=null){
  if(!a.alive)return;a.alive=false;a.health=0;a.deathTick=sim.tick;a.fitness-=25;
  if(sim.mode==='royale')lifetimeAdd('royale',a.species.id,'deaths');
  if(by&&by.owner&&by.owner!==a){by.owner.fitness+=35;by.owner.kills++;if(sim.mode==='royale')lifetimeAdd('royale',by.owner.species.id,'kills');}
}
function finishInvaderTeam(team){if(sim.invaderCleared[team])return;if(sim.invaders.some(n=>n.aliveFor?.[team]))return;sim.invaderCleared[team]=true;for(const a of sim.agents)if(a.species.id===team&&a.alive){a.fitness+=300;a.finished=true;a.alive=false;}}

function stepProjectiles(){
  for(const p of sim.projectiles){
    if(p.dead)continue;p.x+=p.vx;p.y+=p.vy;
    if(projectileOutOfArena(p)||projectileBlocked(p)){p.dead=true;continue;}
    if(sim.mode==='target'&&p.owner){
      for(const t of sim.targets){
        if(!targetActiveFor(t,p.owner.species.id))continue;
        if(circleHit(p,t,p.r,t.r)){p.dead=true;t.hitFlash=6;t.cooldownFor[p.owner.species.id]=sim.tick+120;p.owner.hits++;p.owner.fitness+=45;lifetimeAdd('target',p.owner.species.id,'hits');break;}
      }
    }else if(sim.mode==='invaders'&&p.owner){
      const team=p.owner.species.id;
      for(const n of sim.invaders){if(n.aliveFor?.[team]&&circleHit(p,n,p.r,n.r)){p.dead=true;n.aliveFor[team]=false;n.alive=SPECIES.some(s=>n.aliveFor[s.id]);n.flash=6;p.owner.hits++;p.owner.kills++;p.owner.fitness+=85;lifetimeAdd('invaders',team,'kills');finishInvaderTeam(team);break;}}
    }else if(sim.mode==='royale'){
      for(const a of sim.agents){if(!a.alive||a===p.owner||a.species.id===p.team)continue;if(circleHit(p,a,p.r,AGENT_R)){p.dead=true;a.flash=5;a.health-=.5;p.owner.fitness+=22;if(a.health<=0)killAgent(a,p);break;}}
    }
    if(!p.owner&&sim.mode==='invaders'&&p.targetTeam){
      for(const a of sim.agents){if(!a.alive||a.species.id!==p.targetTeam)continue;if(circleHit(p,a,p.r,AGENT_R)){p.dead=true;killAgent(a,p);break;}}
    }
  }
  sim.projectiles=sim.projectiles.filter(p=>!p.dead);
}
