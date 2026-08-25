'use strict';

function stepBattlefield(){
  const vertical=sim.orientation===0||sim.orientation===2;
  if(sim.tick>=sim.nextArrowTick){
    const lane=sim.battlefieldLanes[randi(sim.battlefieldLanes.length)];
    if(vertical){const fromLeft=Math.random()<.5;sim.arrows.push({x:fromLeft?FIELD.left-10:FIELD.right+10,y:FIELD.top+lane,vx:(fromLeft?1:-1)*PROJECTILE_SPEED,vy:0,r:3,dead:false,hitTeams:{}});}
    else{const fromTop=Math.random()<.5;sim.arrows.push({x:FIELD.left+lane,y:fromTop?FIELD.top-10:FIELD.bottom+10,vx:0,vy:(fromTop?1:-1)*PROJECTILE_SPEED,r:3,dead:false,hitTeams:{}});}
    sim.nextArrowTick=sim.tick+28+randi(15);
  }
  for(const p of sim.arrows){
    p.x+=p.vx;p.y+=p.vy;
    if(projectileOutOfArena(p)||projectileBlocked(p)){p.dead=true;continue;}
    for(const a of sim.agents){if(!a.alive||p.hitTeams[a.species.id])continue;if(circleHit(p,a,p.r,AGENT_R)){p.hitTeams[a.species.id]=true;killAgent(a);}}
  }
  sim.arrows=sim.arrows.filter(p=>!p.dead);
  for(const a of sim.agents){
    if(!a.alive||a.finished)continue;
    const o=objectiveVector(a);a.fitness+=Math.max(0,o.progress)*.02;
    const done=(sim.orientation===0&&a.y<FIELD.top+16)||(sim.orientation===2&&a.y>FIELD.bottom-16)||(sim.orientation===1&&a.x>FIELD.right-16)||(sim.orientation===3&&a.x<FIELD.left+16);
    if(done){a.finished=true;a.alive=false;a.fitness+=700+(MAX_TICKS.battlefield-sim.tick)*.2;lifetimeAdd('battlefield',a.species.id,'crosses');}
  }
  if(sim.agents.every(a=>!a.alive))sim.tick=MAX_TICKS.battlefield;
}

function invaderForward(){if(sim.orientation===0)return{x:0,y:1};if(sim.orientation===2)return{x:0,y:-1};if(sim.orientation===1)return{x:-1,y:0};return{x:1,y:0};}
function invaderShuffle(){return sim.orientation===0||sim.orientation===2?{x:1,y:0}:{x:0,y:1};}
function invaderHasBreached(n){return(sim.orientation===0&&n.y>FIELD.bottom-28)||(sim.orientation===2&&n.y<FIELD.top+28)||(sim.orientation===1&&n.x<FIELD.left+28)||(sim.orientation===3&&n.x>FIELD.right-28);}
function failInvaderTeam(team){
  if(sim.invaderBreached[team]||sim.invaderCleared[team])return;
  sim.invaderBreached[team]=true;
  for(const n of sim.invaders)n.aliveFor[team]=false;
  for(const n of sim.invaders)n.alive=SPECIES.some(s=>n.aliveFor[s.id]);
  for(const a of sim.agents)if(a.species.id===team&&a.alive){a.fitness-=120;a.finished=true;a.alive=false;}
}
function stepInvaders(){
  const f=invaderForward(),s=invaderShuffle(),alive=sim.invaders.filter(n=>n.alive),vertical=sim.orientation===0||sim.orientation===2;
  if(alive.length){
    const dir=alive[0].shuffle,minPos=Math.min(...alive.map(n=>vertical?n.x:n.y)),maxPos=Math.max(...alive.map(n=>vertical?n.x:n.y)),axisMin=vertical?FIELD.left:FIELD.top,axisMax=vertical?FIELD.right:FIELD.bottom;
    if((dir>0&&maxPos>axisMax-25)||(dir<0&&minPos<axisMin+25))for(const n of alive)n.shuffle*=-1;
  }
  const forwardStep=sim.tick%7===0;
  for(const n of alive){
    if(forwardStep){n.vx=f.x*AGENT_SPEED;n.vy=f.y*AGENT_SPEED;}else{n.vx=s.x*n.shuffle*AGENT_SPEED;n.vy=s.y*n.shuffle*AGENT_SPEED;}
    n.x+=n.vx;n.y+=n.vy;
  }

  // Every colour owns an independent logical firing layer. A dead Red copy cannot
  // produce a bullet that Red cannot see but can still be hit by.
  for(const species of SPECIES){
    const team=species.id;if(sim.invaderCleared[team]||sim.invaderBreached[team])continue;
    const teamAlive=sim.invaders.filter(n=>n.aliveFor[team]);
    for(const n of teamAlive){
      const isFront=!teamAlive.some(o=>o.col===n.col&&o.row>n.row);if(!isFront)continue;
      n.fireClockFor[team]--;
      if(n.fireClockFor[team]<=0){
        const count=++n.fireCountFor[team];n.fireClockFor[team]=invaderFireSeed(n.row,n.col,count,sim.generation);
        sim.projectiles.push({x:n.x,y:n.y,vx:f.x*PROJECTILE_SPEED,vy:f.y*PROJECTILE_SPEED,owner:null,team:'invader',targetTeam:team,r:2.5,dead:false});
      }
    }
    if(teamAlive.some(invaderHasBreached))failInvaderTeam(team);
  }

  if(SPECIES.every(s=>sim.invaderCleared[s.id]||sim.invaderBreached[s.id])){sim.endReason='all teams resolved';sim.tick=MAX_TICKS.invaders;}
}

function stepRoyale(){
  const aliveTeams=SPECIES.filter(s=>sim.agents.some(a=>a.alive&&a.species.id===s.id));
  if(aliveTeams.length<=1){
    if(aliveTeams.length===1){sim.winner=aliveTeams[0].id;for(const a of sim.agents)if(a.species.id===sim.winner){a.fitness+=120;if(a.alive)a.fitness+=180;}}
    sim.tick=MAX_TICKS.royale;sim.endReason=aliveTeams.length?'team victory':'draw';
  }
}

function roundSummary(){
  const tag=s=>s.id==='red'?'R':s.id==='green'?'G':'B';
  if(sim.mode==='target')return`Gen ${sim.generation}: `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id).reduce((n,a)=>n+a.hits,0)} hits`).join(' · ');
  if(sim.mode==='battlefield')return`Gen ${sim.generation}: `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id&&a.finished&&a.deathTick===null).length} crossed`).join(' · ');
  if(sim.mode==='invaders')return`Gen ${sim.generation}: `+SPECIES.map(s=>`${tag(s)} ${sim.invaderCleared[s.id]?'cleared':sim.invaderBreached[s.id]?'breached':sim.agents.filter(a=>a.species.id===s.id).reduce((n,a)=>n+a.kills,0)+' kills'}`).join(' · ');
  const result=sim.winner?`${sim.winner.toUpperCase()} wins`:'draw';return`Gen ${sim.generation} (${result}): `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id).reduce((n,a)=>n+a.kills,0)} kills`).join(' · ');
}

function step(){
  if(!sim||paused)return;sim.tick++;stepAgents();
  if(sim.mode==='target')stepTargets();else if(sim.mode==='battlefield')stepBattlefield();else if(sim.mode==='invaders')stepInvaders();
  stepProjectiles();if(sim.mode==='royale')stepRoyale();
  if(sim.tick>=MAX_TICKS[sim.mode])finishGeneration();
}

function finishGeneration(){
  const completedMode=sim.mode;
  for(const a of sim.agents){
    if(completedMode==='target')a.fitness+=a.hits*8;
    if(completedMode==='battlefield'&&!a.finished){const o=objectiveVector(a);a.fitness+=o.progress*110;}
    if(completedMode==='invaders'&&a.alive)a.fitness+=35;
    if(completedMode==='royale'&&a.alive)a.fitness+=10;
    sim.populations[a.species.id][a.idx].fitness=a.fitness;
  }
  sim.lastSummary=roundSummary();sim.lifetimeRounds[completedMode]=(sim.lifetimeRounds[completedMode]||0)+1;
  for(const s of SPECIES){const pop=sim.populations[s.id],best=Math.max(...pop.map(p=>p.fitness));sim.bestEver[s.id]=Math.max(sim.bestEver[s.id],best);sim.populations[s.id]=evolvePopulation(pop);}
  sim.generation++;
  if(sim.pendingMode&&MODE_CONFIG[sim.pendingMode]){sim.mode=sim.pendingMode;selectedMode=sim.pendingMode;sim.pendingMode=null;}
  setupGeneration();
  if(typeof updateRoundResult==='function')updateRoundResult();if(typeof saveExperiment==='function')saveExperiment();
}
