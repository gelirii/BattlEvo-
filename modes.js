function stepTargets(){
  for(const t of sim.targets){
    // Semi-regular movement: straight/bouncing with a gentle periodic turn.
    if((sim.tick+t.id*17)%240===0){const nd=vecToDir(t.dx,t.dy),turn=(t.id%2)?1:-1,d=DIRS[(nd+turn+8)%8];t.dx=d.x;t.dy=d.y;}
    const oldX=t.x,oldY=t.y,len=Math.hypot(t.dx,t.dy)||1;
    t.x+=(t.dx/len)*t.speed;t.y+=(t.dy/len)*t.speed;
    if(t.x<FIELD.left+35||t.x>FIELD.right-35){t.dx*=-1;t.x=clamp(t.x,FIELD.left+35,FIELD.right-35);}
    if(t.y<FIELD.top+35||t.y>FIELD.bottom-35){t.dy*=-1;t.y=clamp(t.y,FIELD.top+35,FIELD.bottom-35);}
    // Moving targets cannot phase through cover; reverse-bouncing keeps paths readable.
    if(sim.bunkers.some(b=>rectCircleHit(b,t,t.r))){t.x=oldX;t.y=oldY;t.dx*=-1;t.dy*=-1;}
    if(t.hitFlash>0)t.hitFlash--;
  }
}

function stepBattlefield(){
  const vertical=sim.orientation===0||sim.orientation===2;
  // Eight equally spaced lanes in the square field for every orientation. Arrows are
  // always perpendicular to the crossing direction and always use projectile speed.
  if(sim.tick%34===0){
    const lane=60+randi(8)*68;
    if(vertical){
      const fromLeft=Math.random()<.5;
      sim.arrows.push({x:fromLeft?FIELD.left-10:FIELD.right+10,y:FIELD.top+lane,vx:(fromLeft?1:-1)*PROJECTILE_SPEED,vy:0,r:3,dead:false,hitTeams:{}});
    }else{
      const fromTop=Math.random()<.5;
      sim.arrows.push({x:FIELD.left+lane,y:fromTop?FIELD.top-10:FIELD.bottom+10,vx:0,vy:(fromTop?1:-1)*PROJECTILE_SPEED,r:3,dead:false,hitTeams:{}});
    }
  }
  for(const p of sim.arrows){
    p.x+=p.vx;p.y+=p.vy;
    if(projectileOutOfArena(p)||projectileBlocked(p)){p.dead=true;continue;}
    // One species cannot physically shield another from the training projectile.
    // A logical arrow may score at most one hit on each colour before leaving the field.
    for(const a of sim.agents){
      if(!a.alive||p.hitTeams[a.species.id])continue;
      if(circleHit(p,a,p.r,AGENT_R)){p.hitTeams[a.species.id]=true;killAgent(a);}
    }
  }
  sim.arrows=sim.arrows.filter(p=>!p.dead);
  for(const a of sim.agents){
    if(!a.alive||a.finished)continue;
    const o=objectiveVector(a);a.fitness+=Math.max(0,o.progress)*.02;
    let done=false;
    if(sim.orientation===0&&a.y<FIELD.top+16)done=true;
    if(sim.orientation===2&&a.y>FIELD.bottom-16)done=true;
    if(sim.orientation===1&&a.x>FIELD.right-16)done=true;
    if(sim.orientation===3&&a.x<FIELD.left+16)done=true;
    if(done){a.finished=true;a.alive=false;a.fitness+=700+(MAX_TICKS.battlefield-sim.tick)*.2;if(typeof lifetimeAdd==='function')lifetimeAdd('battlefield',a.species.id,'crosses');}
  }
}

function invaderForward(){
  if(sim.orientation===0)return{x:0,y:1};
  if(sim.orientation===2)return{x:0,y:-1};
  if(sim.orientation===1)return{x:-1,y:0};
  return{x:1,y:0};
}
function invaderShuffle(){return(sim.orientation===0||sim.orientation===2)?{x:1,y:0}:{x:0,y:1};}
function stepInvaders(){
  const f=invaderForward(),s=invaderShuffle(),alive=sim.invaders.filter(n=>n.alive);
  const vertical=sim.orientation===0||sim.orientation===2;
  if(alive.length){
    const dir=alive[0].shuffle;
    const minPos=Math.min(...alive.map(n=>vertical?n.x:n.y)),maxPos=Math.max(...alive.map(n=>vertical?n.x:n.y));
    const axisMin=vertical?FIELD.left:FIELD.top,axisMax=vertical?FIELD.right:FIELD.bottom;
    if((dir>0&&maxPos>axisMax-25)||(dir<0&&minPos<axisMin+25))for(const n of alive)n.shuffle*=-1;
  }
  // Shuffle and migration are rotated copies of the same square-field motion.
  const forwardStep=sim.tick%7===0;
  for(const n of alive){
    if(forwardStep){n.vx=f.x*AGENT_SPEED;n.vy=f.y*AGENT_SPEED;}
    else{n.vx=s.x*n.shuffle*AGENT_SPEED;n.vy=s.y*n.shuffle*AGENT_SPEED;}
    n.x+=n.vx;n.y+=n.vy;n.fireClock--;
    // Only the front-most living alien in each column can fire: roughly 2–3 hostile
    // shots per second across the formation instead of the old 6–7 shot bullet wall.
    const isFront=!alive.some(o=>o.col===n.col&&o.row>n.row);
    if(isFront&&n.fireClock<=0){
      n.fireClock=90+randi(120);
      sim.projectiles.push({x:n.x,y:n.y,vx:f.x*PROJECTILE_SPEED,vy:f.y*PROJECTILE_SPEED,owner:null,team:'invader',r:2.5,dead:false});
    }
  }

  // Because all four orientations are rotated copies, breach distance is identical.
  for(const n of alive){
    const breached=(sim.orientation===0&&n.y>FIELD.bottom-28)||(sim.orientation===2&&n.y<FIELD.top+28)||(sim.orientation===1&&n.x<FIELD.left+28)||(sim.orientation===3&&n.x>FIELD.right-28);
    if(breached){
      for(const a of sim.agents)if(a.alive)a.fitness-=120;
      sim.endReason='breach';sim.tick=MAX_TICKS.invaders;break;
    }
  }
  if(alive.length===0){sim.endReason='all waves cleared';sim.tick=MAX_TICKS.invaders;}
}

function stepRoyale(){
  const aliveTeams=SPECIES.filter(s=>sim.agents.some(a=>a.alive&&a.species.id===s.id));
  if(aliveTeams.length<=1){
    if(aliveTeams.length===1){
      sim.winner=aliveTeams[0].id;
      // Team success matters, but surviving contributors receive more than passengers.
      for(const a of sim.agents)if(a.species.id===sim.winner){a.fitness+=120;if(a.alive)a.fitness+=180;}
    }
    sim.tick=MAX_TICKS.royale;sim.endReason=aliveTeams.length?'team victory':'draw';
  }
}

function roundSummary(){
  const tag=(s)=>s.id==='red'?'R':s.id==='green'?'G':'B';
  if(sim.mode==='target')return `Gen ${sim.generation}: `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id).reduce((n,a)=>n+a.hits,0)} hits`).join(' · ');
  if(sim.mode==='battlefield')return `Gen ${sim.generation}: `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id&&a.finished).length} crossed`).join(' · ');
  if(sim.mode==='invaders'){
    const reason=sim.endReason||'time';
    return `Gen ${sim.generation} (${reason}): `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id).reduce((n,a)=>n+a.kills,0)}${sim.invaderCleared[s.id]?'✓':''}`).join(' · ');
  }
  const result=sim.winner?`${sim.winner.toUpperCase()} wins`:'draw';
  return `Gen ${sim.generation} (${result}): `+SPECIES.map(s=>`${tag(s)} ${sim.agents.filter(a=>a.species.id===s.id).reduce((n,a)=>n+a.kills,0)} kills`).join(' · ');
}

function step(){
  if(!sim||paused)return;
  sim.tick++;
  stepAgents();
  if(sim.mode==='target')stepTargets();
  if(sim.mode==='battlefield')stepBattlefield();
  if(sim.mode==='invaders')stepInvaders();
  stepProjectiles();
  if(sim.mode==='royale')stepRoyale();
  if(sim.tick>=MAX_TICKS[sim.mode])finishGeneration();
}

function finishGeneration(){
  for(const a of sim.agents){
    if(sim.mode==='target')a.fitness+=a.hits*8;
    if(sim.mode==='battlefield'&&!a.finished){const o=objectiveVector(a);a.fitness+=o.progress*110;}
    if(sim.mode==='invaders'&&a.alive)a.fitness+=35;
    // Timed Royale survival is a small signal; fighting and team victory dominate.
    if(sim.mode==='royale'&&a.alive)a.fitness+=10;
    sim.populations[a.species.id][a.idx].fitness=a.fitness;
  }
  sim.lastSummary=roundSummary();
  for(const s of SPECIES){
    const pop=sim.populations[s.id],best=Math.max(...pop.map(p=>p.fitness));
    sim.bestEver[s.id]=Math.max(sim.bestEver[s.id],best);
    sim.populations[s.id]=evolvePopulation(pop);
  }
  sim.generation++;setupGeneration();
  if(typeof updateRoundResult==='function')updateRoundResult();
}
