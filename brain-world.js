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

function segmentIntersectsRect(x1,y1,x2,y2,r){
  const dx=x2-x1,dy=y2-y1;let t0=0,t1=1;
  const clip=(p,q)=>{if(Math.abs(p)<1e-9)return q>=0;const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}return true;};
  return clip(-dx,x1-r.x)&&clip(dx,r.x+r.w-x1)&&clip(-dy,y1-r.y)&&clip(dy,r.y+r.h-y1);
}
// 360° top-down tactical awareness. Dynamic objects always retain known coordinates;
// this function supplies the separate clear-line-of-sight bit used by their slots.
function lineOfSight(agent,obj,ignoreBunkerId=null){
  for(const b of sim.bunkers){if(b.id===ignoreBunkerId)continue;if(segmentIntersectsRect(agent.x,agent.y,obj.x,obj.y,b))return false;}
  return true;
}
function normX(x){return clamp((x-FIELD.cx)/(FIELD.size/2),-1,1);}
function normY(y){return clamp((y-FIELD.cy)/(FIELD.size/2),-1,1);}
function rankByDistance(agent,list){list.sort((a,b)=>dist2(agent,a)-dist2(agent,b)||(a.x-b.x)||(a.y-b.y));return list;}
function actorVelocity(o){
  if(o.species){return{x:clamp((o.x-o.lastX)/AGENT_SPEED,-1,1),y:clamp((o.y-o.lastY)/AGENT_SPEED,-1,1)};}
  if(Number.isFinite(o.dx)||Number.isFinite(o.dy)){const len=Math.hypot(o.dx||0,o.dy||0)||1,scale=(o.speed||AGENT_SPEED)/AGENT_SPEED;return{x:clamp((o.dx||0)/len*scale,-1,1),y:clamp((o.dy||0)/len*scale,-1,1)};}
  return{x:clamp((o.vx||0)/AGENT_SPEED,-1,1),y:clamp((o.vy||0)/AGENT_SPEED,-1,1)};
}
function actorFacing(o){
  if(Number.isFinite(o.aimX)&&Number.isFinite(o.aimY)){const len=Math.hypot(o.aimX,o.aimY)||1;return{x:o.aimX/len,y:o.aimY/len};}
  return Number.isInteger(o.facing)&&DIRS[o.facing]?DIRS[o.facing]:{x:0,y:0};
}
function actorHealth(o){return Number.isFinite(o.health)?clamp(o.health,0,1):1;}

function fillTacticalView(a){
  const v=a.tacticalView;v.friends.length=0;v.enemies.length=0;v.friendlyProjectiles.length=0;v.enemyProjectiles.length=0;
  const team=a.species.id;

  if(sim.mode!=='target'){
    for(const o of sim.agents)if(o!==a&&o.alive&&o.species.id===team)v.friends.push(o);
  }
  if(sim.mode==='target'){
    for(const t of sim.targets)if(targetActiveFor(t,team))v.enemies.push(t);
  }else if(sim.mode==='invaders'){
    for(const n of sim.invaders)if(n.aliveFor?.[team])v.enemies.push(n);
  }else if(sim.mode==='royale'){
    for(const o of sim.agents)if(o!==a&&o.alive&&o.species.id!==team)v.enemies.push(o);
  }

  for(const p of sim.projectiles){
    if(p.dead)continue;
    if(sim.mode==='target'){
      if(p.owner===a)v.friendlyProjectiles.push(p);
    }else if(sim.mode==='battlefield'){
      if(p.owner?.species?.id===team)v.friendlyProjectiles.push(p);
    }else if(sim.mode==='invaders'){
      if(p.owner?.species?.id===team)v.friendlyProjectiles.push(p);
      else if(!p.owner&&p.team==='invader'&&p.targetTeam===team)v.enemyProjectiles.push(p);
    }else if(sim.mode==='royale'){
      if(p.owner?.species?.id===team)v.friendlyProjectiles.push(p);
      else if(p.owner&&p.team!==team)v.enemyProjectiles.push(p);
    }
  }
  if(sim.mode==='battlefield')for(const p of sim.arrows)if(!p.dead)v.enemyProjectiles.push(p);

  rankByDistance(a,v.friends);rankByDistance(a,v.enemies);rankByDistance(a,v.friendlyProjectiles);rankByDistance(a,v.enemyProjectiles);
  return v;
}

function writeBunkerSlot(input,k,b){
  if(!b)return k+BUNKER_INPUTS;
  input[k++]=1;input[k++]=normX(b.x+b.w/2);input[k++]=normY(b.y+b.h/2);input[k++]=clamp(b.w/FIELD.size,0,1);input[k++]=clamp(b.h/FIELD.size,0,1);return k;
}
function writeActorSlot(input,k,o,a){
  if(!o)return k+ACTOR_INPUTS;
  const vel=actorVelocity(o),face=actorFacing(o);input[k++]=lineOfSight(a,o)?1:0;input[k++]=normX(o.x);input[k++]=normY(o.y);input[k++]=vel.x;input[k++]=vel.y;input[k++]=face.x;input[k++]=face.y;input[k++]=actorHealth(o);return k;
}
function writeProjectileSlot(input,k,p,a){
  if(!p)return k+PROJECTILE_INPUTS;
  input[k++]=lineOfSight(a,p)?1:0;input[k++]=normX(p.x);input[k++]=normY(p.y);input[k++]=clamp((p.vx||0)/PROJECTILE_SPEED,-1,1);input[k++]=clamp((p.vy||0)/PROJECTILE_SPEED,-1,1);return k;
}

function buildInputs(a){
  const input=a.inputBuffer;input.fill(0);let k=0;
  const face=actorFacing(a),move=a.moveDir>=0?DIRS[a.moveDir]:{x:0,y:0},obj=objectiveVector(a);
  input[k++]=normX(a.x);input[k++]=normY(a.y);input[k++]=clamp(a.health,0,1);input[k++]=a.cooldown<=0?1:0;
  input[k++]=face.x;input[k++]=face.y;input[k++]=move.x;input[k++]=move.y;input[k++]=obj.x;input[k++]=obj.y;input[k++]=obj.progress;
  const clock=sim.tick*.025+sim.clockPhase;input[k++]=Math.sin(clock);input[k++]=Math.cos(clock);

  const bunkers=[...sim.bunkers].sort((a,b)=>(a.x-b.x)||(a.y-b.y));
  for(let i=0;i<TACTICAL_SLOTS.bunkers;i++)k=writeBunkerSlot(input,k,bunkers[i]);
  const view=fillTacticalView(a);
  for(let i=0;i<TACTICAL_SLOTS.friends;i++)k=writeActorSlot(input,k,view.friends[i],a);
  for(let i=0;i<TACTICAL_SLOTS.enemies;i++)k=writeActorSlot(input,k,view.enemies[i],a);
  for(let i=0;i<TACTICAL_SLOTS.friendlyProjectiles;i++)k=writeProjectileSlot(input,k,view.friendlyProjectiles[i],a);
  for(let i=0;i<TACTICAL_SLOTS.enemyProjectiles;i++)k=writeProjectileSlot(input,k,view.enemyProjectiles[i],a);
  if(k!==INPUTS)throw new Error(`Tactical input layout wrote ${k}/${INPUTS} values.`);
  return input;
}

function aimVectorFromOutputs(out){
  let max=-Infinity;for(let i=9;i<17;i++)if(out[i]>max)max=out[i];
  let x=0,y=0,total=0;
  for(let i=0;i<8;i++){const w=Math.exp(clamp(out[9+i]-max,-20,0));x+=DIRS[i].x*w;y+=DIRS[i].y*w;total+=w;}
  const len=Math.hypot(x,y);if(!Number.isFinite(len)||len<1e-6||total<=0)return null;
  return{x:x/len,y:y/len};
}
function chooseAction(a){
  const out=a.genotype.brain.run(buildInputs(a));let mi=0;for(let i=1;i<9;i++)if(out[i]>out[mi])mi=i;a.moveDir=mi===0?-1:mi-1;
  const aim=aimVectorFromOutputs(out);if(aim){a.aimX=aim.x;a.aimY=aim.y;const nearest=vecToDir(aim.x,aim.y);if(nearest>=0)a.facing=nearest;}
  return out[17]>.15;
}
function tryMove(a){
  if(a.moveDir<0)return;let d=DIRS[a.moveDir];
  if(sim.mode==='invaders'){const horizontal=sim.orientation===0||sim.orientation===2;d=horizontal?{x:Math.sign(d.x),y:0}:{x:0,y:Math.sign(d.y)};if(d.x===0&&d.y===0)return;}
  const nx=clamp(a.x+d.x*AGENT_SPEED,FIELD.left+AGENT_R,FIELD.right-AGENT_R),ny=clamp(a.y+d.y*AGENT_SPEED,FIELD.top+AGENT_R,FIELD.bottom-AGENT_R),test={x:nx,y:ny};
  if(sim.bunkers.some(b=>rectCircleHit(b,test,AGENT_R)))return;
  if(sim.mode==='royale'&&sim.agents.some(o=>o!==a&&o.alive&&dist2(test,o)<(AGENT_R*2)*(AGENT_R*2)))return;
  a.x=nx;a.y=ny;
}
function fire(a){
  if(a.cooldown>0||!a.alive)return;
  let dx=Number.isFinite(a.aimX)?a.aimX:0,dy=Number.isFinite(a.aimY)?a.aimY:0,len=Math.hypot(dx,dy);if(len<1e-6){const d=DIRS[a.facing]||DIRS[0];dx=d.x;dy=d.y;len=1;}dx/=len;dy/=len;
  a.cooldown=24;a.shots++;sim.projectiles.push({x:a.x+dx*11,y:a.y+dy*11,vx:dx*PROJECTILE_SPEED,vy:dy*PROJECTILE_SPEED,owner:a,team:a.species.id,r:2.5,dead:false});a.fitness-=SHOT_COST[sim.mode]||0;
}
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
